-- Add "partially paid" to the invoice status enum and update the payment trigger
-- to allow transitioning to "paid" from a partially-paid state.

ALTER TYPE public.invoice_status ADD VALUE 'partially paid';

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
    WHERE id = NEW.invoice_id AND status IN ('draft', 'sent', 'overdue', 'partially paid');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
