-- Phase 2: write policies for projects, milestones, updates, deliverables
-- and a private storage bucket for deliverables.

-- Helper: is the current user an admin or staff?
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'staff')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: does the current user own the given project?
CREATE OR REPLACE FUNCTION public.owns_project(p_project_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND client_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- PROJECTS: staff can insert/update/delete
CREATE POLICY "projects_insert_staff" ON public.projects
  FOR INSERT WITH CHECK (public.is_staff());
CREATE POLICY "projects_update_staff" ON public.projects
  FOR UPDATE USING (public.is_staff());
CREATE POLICY "projects_delete_staff" ON public.projects
  FOR DELETE USING (public.is_staff());

-- MILESTONES: staff full write; clients may UPDATE status (approval) on own projects
CREATE POLICY "milestones_insert_staff" ON public.project_milestones
  FOR INSERT WITH CHECK (public.is_staff());
CREATE POLICY "milestones_update_staff_or_owner" ON public.project_milestones
  FOR UPDATE USING (public.is_staff() OR public.owns_project(project_id));
CREATE POLICY "milestones_delete_staff" ON public.project_milestones
  FOR DELETE USING (public.is_staff());

-- UPDATES: staff insert; clients may insert on own projects (approval comments)
CREATE POLICY "updates_insert_staff_or_owner" ON public.project_updates
  FOR INSERT WITH CHECK (public.is_staff() OR public.owns_project(project_id));
CREATE POLICY "updates_delete_staff" ON public.project_updates
  FOR DELETE USING (public.is_staff());

-- DELIVERABLES: staff full write
CREATE POLICY "deliverables_insert_staff" ON public.deliverables
  FOR INSERT WITH CHECK (public.is_staff());
CREATE POLICY "deliverables_update_staff" ON public.deliverables
  FOR UPDATE USING (public.is_staff());
CREATE POLICY "deliverables_delete_staff" ON public.deliverables
  FOR DELETE USING (public.is_staff());

-- Private storage bucket for deliverables (uploads/downloads handled server-side
-- via the service-role client and signed URLs, so no storage RLS policies needed).
INSERT INTO storage.buckets (id, name, public)
VALUES ('deliverables', 'deliverables', false)
ON CONFLICT (id) DO NOTHING;
