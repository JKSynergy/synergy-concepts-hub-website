-- =====================================================================
-- 013_security_privilege_hardening.sql
-- Migration 013 — Standalone Pre-Phase-3 Security Privilege Hardening
-- SCH Portal / Synergy Concepts Hub
--
-- TARGET: Hosted PostgreSQL (DEV: outuocpsotiozkpyksex)
--
-- PURPOSE:
-- Correct the hosted PostgreSQL privilege model on the 16 existing
-- Phase 2C application tables. Specifically resolves the remaining
-- Phase 2C warning:
--   "anon/authenticated hold TRUNCATE on 14 tables (not reachable
--    through the Data API; consider revoking in the bootstrap step)"
--
-- SCOPE & CONSTRAINTS:
-- - ADDITIVE / SECURITY-HARDENING ONLY.
-- - No tables created, altered, or dropped.
-- - No RLS policies modified, dropped, or disabled.
-- - No triggers modified, dropped, or disabled.
-- - No application data modified or deleted.
-- - No Phase 3 tables or features introduced.
-- - Explicit table-by-table grants and revokes (no blanket GRANT ALL).
-- - Fully idempotent and wrapped in a transaction.
--
-- PRIVILEGE MODEL:
-- 1. anon:
--    Explicitly NO DML privileges on application tables
--    (NO SELECT, INSERT, UPDATE, DELETE, TRUNCATE).
-- 2. authenticated:
--    SELECT, INSERT, UPDATE, DELETE on the 14 application tables:
--      profiles, service_catalog, bookings, leads, projects,
--      project_assignments, project_milestones, project_updates,
--      deliverables, invoices, invoice_line_items, payments, receipts,
--      academy_courses.
--    SELECT ONLY on audit_logs (append-only via SECURITY DEFINER functions).
--    NO PRIVILEGES on document_counters (accessed strictly via next_document_number()).
--    TRUNCATE DENIED on all 16 tables.
-- 3. service_role:
--    SELECT, INSERT, UPDATE, DELETE on all 16 application tables.
--    TRUNCATE DENIED on all 16 tables.
-- 4. sequences:
--    USAGE, SELECT granted to authenticated and service_role.
--    ALL revoked from anon.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- STEP 1: Revoke ALL existing privileges on all 16 Phase 2C tables
-- from anon and authenticated. This immediately clears out any legacy
-- defaults including TRUNCATE, REFERENCES, TRIGGER, and excess DML.
-- ---------------------------------------------------------------------
REVOKE ALL ON TABLE
  public.profiles,
  public.service_catalog,
  public.bookings,
  public.leads,
  public.projects,
  public.project_assignments,
  public.project_milestones,
  public.project_updates,
  public.deliverables,
  public.invoices,
  public.invoice_line_items,
  public.payments,
  public.receipts,
  public.audit_logs,
  public.document_counters,
  public.academy_courses
FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- STEP 2: Revoke TRUNCATE on all 16 tables from service_role.
-- service_role retains DML for normal server operation, but TRUNCATE
-- is stripped to prevent accidental full-table wipes.
-- ---------------------------------------------------------------------
REVOKE TRUNCATE ON TABLE
  public.profiles,
  public.service_catalog,
  public.bookings,
  public.leads,
  public.projects,
  public.project_assignments,
  public.project_milestones,
  public.project_updates,
  public.deliverables,
  public.invoices,
  public.invoice_line_items,
  public.payments,
  public.receipts,
  public.audit_logs,
  public.document_counters,
  public.academy_courses
FROM service_role;

-- ---------------------------------------------------------------------
-- STEP 3: Grant explicit required DML privileges to service_role on
-- all 16 application tables.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.profiles,
  public.service_catalog,
  public.bookings,
  public.leads,
  public.projects,
  public.project_assignments,
  public.project_milestones,
  public.project_updates,
  public.deliverables,
  public.invoices,
  public.invoice_line_items,
  public.payments,
  public.receipts,
  public.audit_logs,
  public.document_counters,
  public.academy_courses
TO service_role;

-- ---------------------------------------------------------------------
-- STEP 4: Grant explicit required DML privileges to authenticated on
-- the 14 interactive application tables.
-- (RLS policies govern all row-level access).
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.profiles,
  public.service_catalog,
  public.bookings,
  public.leads,
  public.projects,
  public.project_assignments,
  public.project_milestones,
  public.project_updates,
  public.deliverables,
  public.invoices,
  public.invoice_line_items,
  public.payments,
  public.receipts,
  public.academy_courses
TO authenticated;

-- ---------------------------------------------------------------------
-- STEP 5: Grant SELECT ONLY on audit_logs to authenticated.
-- Audit logs are immutable and append-only through SECURITY DEFINER
-- functions.
-- ---------------------------------------------------------------------
GRANT SELECT ON TABLE public.audit_logs TO authenticated;

-- ---------------------------------------------------------------------
-- STEP 6: Ensure document_counters has NO privileges for authenticated.
-- (No grant is issued. Access remains exclusive to next_document_number()).
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- STEP 7: Sequences privilege hardening.
-- ---------------------------------------------------------------------
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

COMMIT;
