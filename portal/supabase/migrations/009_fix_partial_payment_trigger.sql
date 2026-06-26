-- Update the payment trigger so that a payment only marks the invoice as paid
-- when the total paid amount covers the invoice total. Otherwise the invoice
-- becomes "partially paid".

-- Ensure the enum value exists before the function uses it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.invoice_status'::regtype
    AND enumlabel = 'partially paid'
  ) THEN
    ALTER TYPE public.invoice_status ADD VALUE 'partially paid';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_payment_receipt()
RETURNS TRIGGER AS $$
DECLARE
  total_paid numeric;
  inv_total numeric;
  new_status public.invoice_status;
BEGIN
  IF NEW.paid_at IS NOT NULL AND OLD.paid_at IS NULL THEN
    INSERT INTO public.receipts (payment_id, invoice_id, receipt_number)
    VALUES (
      NEW.id,
      NEW.invoice_id,
      public.generate_receipt_number()
    );

    SELECT COALESCE(SUM(amount), 0) INTO total_paid
    FROM public.payments
    WHERE invoice_id = NEW.invoice_id AND paid_at IS NOT NULL;

    SELECT COALESCE(total, 0) INTO inv_total
    FROM public.invoices
    WHERE id = NEW.invoice_id;

    IF inv_total > 0 AND total_paid >= inv_total THEN
      new_status := 'paid';
    ELSE
      new_status := 'partially paid';
    END IF;

    UPDATE public.invoices
    SET status = new_status
    WHERE id = NEW.invoice_id AND status IN ('draft', 'sent', 'overdue', 'partially paid');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill existing invoices that were incorrectly marked as paid when only a
-- partial payment was recorded.
UPDATE public.invoices i
SET status = 'partially paid'
WHERE i.status = 'paid'
  AND i.total > 0
  AND COALESCE((
    SELECT SUM(p.amount)
    FROM public.payments p
    WHERE p.invoice_id = i.id AND p.paid_at IS NOT NULL
  ), 0) < i.total;

-- And mark any invoices as paid where payments fully cover the total.
UPDATE public.invoices i
SET status = 'paid'
WHERE i.status IN ('draft', 'sent', 'overdue', 'partially paid')
  AND i.total > 0
  AND COALESCE((
    SELECT SUM(p.amount)
    FROM public.payments p
    WHERE p.invoice_id = i.id AND p.paid_at IS NOT NULL
  ), 0) >= i.total;
