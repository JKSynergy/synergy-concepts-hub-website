import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NewProjectForm from "./new-project-form";
import { PageHeader } from "@/components/ux/primitives";
import ProjectsTable, { type ProjectRow } from "./projects-table";
import { isFinance, isInternal, isAdmin as isAdminRole } from "@/lib/security/roles";

export default async function AdminProjectsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !isInternal(profile.role)) {
    redirect("/client");
  }

  const isAdmin = isAdminRole(profile.role);

  const { data: clients } = await supabase
    .from("profiles")
    .select("id, email, company_name, full_name")
    .eq("role", "client")
    .order("company_name");

  let projectQuery = supabase
    .from("projects")
    .select("id, title, status, progress_percent, target_date, client_id")
    .order("created_at", { ascending: false });

  if (!isAdmin && !isFinance(profile.role)) {
    const { data: assigned } = await supabase
      .from("project_assignments")
      .select("project_id")
      .eq("staff_id", user.id);
    const assignedIds = (assigned ?? []).map((a) => a.project_id);
    if (assignedIds.length > 0) {
      projectQuery = projectQuery.in("id", assignedIds);
    } else {
      projectQuery = projectQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    }
  }

  const { data: projects } = await projectQuery;

  const clientMap = new Map(
    (clients ?? []).map((c) => [
      c.id,
      c.company_name || c.full_name || c.email,
    ])
  );

  const clientOptions = (clients ?? []).map((c) => ({
    id: c.id,
    label: c.company_name || c.full_name || c.email,
  }));

  const rows: ProjectRow[] = (projects ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    progress_percent: p.progress_percent,
    target_date: p.target_date,
    client_name: clientMap.get(p.client_id) ?? "Unknown client",
  }));

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Projects"
        description="Work in progress for clients, from first quote to delivery."
        actions={isAdmin ? <NewProjectForm clients={clientOptions} /> : undefined}
      />
      <ProjectsTable rows={rows} canCreate={isAdmin} clients={clientOptions} />
    </div>
  );
}
