
































































-- PHASE 2C baseline check. READ-ONLY (SELECTs only). Run in the SQL editor of the
-- DEVELOPMENT/STAGING Supabase project only. Paste each result back to Claude.

-- 1. Which project is this? (confirm it is NOT production before anything else)
select current_database() as db, current_setting('server_version') as pg, now();

-- 2. Tables and whether RLS is on (every row must show rls = true)
select c.relname as table, c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by 1;

-- 3. Policies (compare with migrations 001-010)
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;

-- 4. Functions and triggers added by the migrations
select p.proname, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by 1;
select event_object_table as table, trigger_name, event_manipulation
from information_schema.triggers where trigger_schema = 'public' order by 1, 2;

-- 5. Migration 010 markers (all must be true)
select
  exists (select 1 from pg_policies where schemaname='public' and tablename='invoices' and policyname='invoices_select_visible') as m010_invoice_policy,
  exists (select 1 from pg_tables where schemaname='public' and tablename='audit_logs') as audit_logs,
  exists (select 1 from pg_tables where schemaname='public' and tablename='document_counters') as document_counters,
  exists (select 1 from pg_tables where schemaname='public' and tablename='receipts') as receipts;

-- 5b. Migrations 011/012 markers (all must be true after applying them to DEV)
select
  exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='app_role' and e.enumlabel='finance') as m011_finance_role,
  exists (select 1 from pg_proc where proname='can_access_finance') as m012_can_access_finance,
  exists (select 1 from pg_proc where proname='is_finance') as m012_is_finance,
  exists (select 1 from pg_policies where schemaname='public' and tablename='invoices' and policyname='invoices_select_visible' and qual like '%can_access_finance%') as m012_invoice_select,
  exists (select 1 from pg_policies where schemaname='public' and tablename='service_catalog' and policyname='services_insert_admin') as m012_services_admin_only,
  not exists (select 1 from pg_policies where schemaname='public' and tablename='service_catalog' and policyname like '%_staff') as m012_no_staff_service_writes;

-- 6. Row counts only (no data is shown)
select 'profiles' t, count(*) from profiles union all select 'invoices', count(*) from invoices
union all select 'payments', count(*) from payments union all select 'projects', count(*) from projects;
