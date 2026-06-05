-- Phase 4: Invoices & Receipts
-- Write policies for invoices, line items, payments, receipts
-- Sequential invoice numbering, receipt auto-generation

-- INVOICES: staff full write; clients no write
CREATE POLICY "invoices_insert_staff" ON public.invoices
  FOR INSERT WITH CHECK (public.is_staff());
CREATE POLICY "invoices_update_staff" ON public.invoices
  FOR UPDATE USING (public.is_staff());
CREATE POLICY "invoices_delete_staff" ON public.invoices
  FOR DELETE USING (public.is_staff());

-- INVOICE LINE ITEMS: staff full write; clients select via invoice visibility
CREATE POLICY "line_items_insert_staff" ON public.invoice_line_items
  FOR INSERT WITH CHECK (public.is_staff());
CREATE POLICY "line_items_update_staff" ON public.invoice_line_items
  FOR UPDATE USING (public.is_staff());
CREATE POLICY "line_items_delete_staff" ON public.invoice_line_items
  FOR DELETE USING (public.is_staff());
CREATE POLICY "line_items_select_own" ON public.invoice_line_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_id AND (
      i.client_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff')
      )
    )
  ));

-- PAYMENTS: staff can insert/update/delete; clients can select only
CREATE POLICY "payments_insert_staff" ON public.payments
  FOR INSERT WITH CHECK (public.is_staff());
CREATE POLICY "payments_update_staff" ON public.payments
  FOR UPDATE USING (public.is_staff());
CREATE POLICY "payments_delete_staff" ON public.payments
  FOR DELETE USING (public.is_staff());

-- RECEIPTS: staff full write; clients select via invoice visibility
CREATE POLICY "receipts_insert_staff" ON public.receipts
  FOR INSERT WITH CHECK (public.is_staff());
CREATE POLICY "receipts_update_staff" ON public.receipts
  FOR UPDATE USING (public.is_staff());
CREATE POLICY "receipts_delete_staff" ON public.receipts
  FOR DELETE USING (public.is_staff());
CREATE POLICY "receipts_select_own" ON public.receipts
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_id AND (
      i.client_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff')
      )
    )
  ));

-- Helper: generate next invoice number (e.g. SCH-2026-0042)
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text AS $$
DECLARE
  year text := to_char(current_date, 'YYYY');
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(invoice_number FROM 'SCH-[0-9]{4}-([0-9]+)') AS integer)
  ), 0) + 1
  INTO next_num
  FROM public.invoices
  WHERE invoice_number LIKE 'SCH-' || year || '-%';

  RETURN 'SCH-' || year || '-' || LPAD(next_num::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Helper: generate next receipt number
CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS text AS $$
DECLARE
  year text := to_char(current_date, 'YYYY');
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(receipt_number FROM 'RCP-[0-9]{4}-([0-9]+)') AS integer)
  ), 0) + 1
  INTO next_num
  FROM public.receipts
  WHERE receipt_number LIKE 'RCP-' || year || '-%';

  RETURN 'RCP-' || year || '-' || LPAD(next_num::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Trigger: auto-update invoice totals when line items change
CREATE OR REPLACE FUNCTION public.recalculate_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
  inv_id uuid;
  subtotal numeric(12,2);
  tax_rate numeric(5,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    inv_id := OLD.invoice_id;
  ELSE
    inv_id := NEW.invoice_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO subtotal
  FROM public.invoice_line_items
  WHERE invoice_id = inv_id;

  SELECT COALESCE(i.tax_rate, 0) INTO tax_rate
  FROM public.invoices i
  WHERE i.id = inv_id;

  UPDATE public.invoices
  SET subtotal = subtotal,
      tax_amount = ROUND(subtotal * tax_rate / 100, 2),
      total = subtotal + ROUND(subtotal * tax_rate / 100, 2)
  WHERE id = inv_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER line_items_recalc_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_invoice_totals();

-- Trigger: auto-create receipt when a payment is recorded (paid_at is set)
CREATE OR REPLACE FUNCTION public.handle_payment_receipt()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL THEN
    INSERT INTO public.receipts (payment_id, invoice_id, receipt_number)
    VALUES (
      NEW.id,
      NEW.invoice_id,
      public.generate_receipt_number()
    );

    UPDATE public.invoices
    SET status = 'paid'
    WHERE id = NEW.invoice_id AND status IN ('draft', 'sent', 'overdue');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_create_receipt
  AFTER UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.handle_payment_receipt();

-- Also trigger on INSERT if paid_at is set immediately
CREATE TRIGGER payment_insert_receipt
  AFTER INSERT ON public.payments
  FOR EACH ROW
  WHEN (NEW.paid_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_payment_receipt();

-- Storage bucket for invoices/receipts PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('finance-docs', 'finance-docs', false)
ON CONFLICT (id) DO NOTHING;
