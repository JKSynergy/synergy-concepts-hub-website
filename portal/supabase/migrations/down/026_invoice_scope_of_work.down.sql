-- Rollback for migration 026 — removes the invoice Scope of Work column.
BEGIN;

ALTER TABLE public.invoices
  DROP COLUMN IF EXISTS scope_of_work;

COMMIT;
