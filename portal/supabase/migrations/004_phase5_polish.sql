-- Phase 5: Polish & Migration
-- Academy courses, staff project assignments, external portal URLs, reports support

-- 1. External portal URL on client profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS external_portal_url text;

-- 2. Staff project assignments
CREATE TABLE IF NOT EXISTS public.project_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, staff_id)
);

-- 3. Academy courses catalog
CREATE TABLE IF NOT EXISTS public.academy_courses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  duration_weeks integer,
  price_ugx integer,
  price_usd integer,
  intake_dates text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_assignments_project_id ON public.project_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_staff_id ON public.project_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_academy_courses_active ON public.academy_courses(is_active);

-- RLS on new tables
ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_courses ENABLE ROW LEVEL SECURITY;

-- Admins/staff can read all assignments; clients can't see assignments
CREATE POLICY "project_assignments_select_staff" ON public.project_assignments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff')
  ));

-- Only admins can manage assignments
CREATE POLICY "project_assignments_insert_admin" ON public.project_assignments
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "project_assignments_delete_admin" ON public.project_assignments
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Academy courses: all authenticated users can read active courses
CREATE POLICY "academy_courses_select_all" ON public.academy_courses
  FOR SELECT USING (is_active = true OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff')
  ));

-- Only admins/staff can manage academy courses
CREATE POLICY "academy_courses_manage_staff" ON public.academy_courses
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff')
  ));

-- Update existing RLS policies to restrict staff on finance tables
-- Invoices: only admin can create/update/delete; staff can read (existing policy already allows read)
-- We keep existing select policies but ensure mutations require admin via application logic

-- Trigger for updated_at on academy_courses
CREATE TRIGGER set_academy_courses_updated_at
  BEFORE UPDATE ON public.academy_courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
