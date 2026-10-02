-- PROPOSED (not a migration, not in supabase/migrations, not applied by any script).
-- Table privileges the authorization model needs on a Supabase project whose public schema has NO automatic
-- grants for anon / authenticated / service_role. Migrations 001-012 create the tables, enable RLS and write the
-- policies, but never grant table privileges (they relied on Supabase's default grants). See
-- docs/PHASE2C-PRIVILEGE-BOOTSTRAP-RECOMMENDATION.md before deciding where this belongs.
--
-- Properties:
--   * explicit table list, four DML privileges only (no ALL, no TRUNCATE/REFERENCES/TRIGGER)
--   * RLS is untouched and still decides which rows each role sees
--   * keeps migration 010's intent: audit_logs is read-only for signed-in users, document_counters is server-only
--   * anon receives nothing (no policy targets anon; the public quote route uses the service role)
--   * idempotent: GRANT is a no-op when the privilege is already held
BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.profiles, public.service_catalog, public.bookings, public.leads,
  public.projects, public.project_assignments, public.project_milestones,
  public.project_updates, public.deliverables, public.invoices,
  public.invoice_line_items, public.payments, public.receipts,
  public.audit_logs, public.document_counters, public.academy_courses
TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.profiles, public.service_catalog, public.bookings, public.leads,
  public.projects, public.project_assignments, public.project_milestones,
  public.project_updates, public.deliverables, public.invoices,
  public.invoice_line_items, public.payments, public.receipts,
  public.academy_courses
TO authenticated;

GRANT SELECT ON public.audit_logs TO authenticated;

COMMIT;
