-- ============================================================================
-- Migration 026 — Invoice Scope of Work
-- ============================================================================
--
-- Adds one free-form, multiline text field to invoices. It is stored separately
-- from `notes` and rendered on the invoice PDF immediately above the
-- Investment (line-items) table. It is plain text by design: no structured
-- scope objects, rows or categories.
--
-- Additive and nullable: existing invoices, RLS policies, triggers and totals
-- are unaffected.
-- ============================================================================

BEGIN;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS scope_of_work text;

COMMENT ON COLUMN public.invoices.scope_of_work IS
  'Free-form scope of work shown on the invoice PDF above the line items. Newline-separated lines render as separate lines.';

COMMIT;
