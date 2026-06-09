-- Fix: admins/staff could not see client profiles.
--
-- The original profiles SELECT policy used an unqualified `role` column:
--
--   USING (id = auth.uid() OR role IN ('admin', 'staff'))
--
-- In an RLS USING clause `role` refers to the ROW being read, not the
-- current user. So the rule actually meant "you may read a profile if it is
-- your own row, OR if that row belongs to an admin/staff member." Client rows
-- (role = 'client') were therefore invisible to everyone except the client
-- themselves — which is why the admin Clients list showed "No clients yet"
-- and client dropdowns elsewhere were empty.
--
-- public.is_staff() is a SECURITY DEFINER helper that checks the CURRENT
-- user's role without triggering RLS recursion, so use it instead.

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_staff());
