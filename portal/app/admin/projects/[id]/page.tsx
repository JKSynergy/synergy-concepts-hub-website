import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import EditProject from "./edit-project";
import MilestonesSection from "./milestones-section";
import UpdatesSection from "@/components/updates-section";
import DeliverablesSection from "@/components/deliverables-section";
import StaffAssignments from "./staff-assignments";
import type { Milestone, Project, ProjectUpdate, Deliverable } from "@/lib/types";
import { isFinance, isInternal, isAdmin as isAdminRole, isOperationalStaff } from "@/lib/security/roles";

export default async function AdminProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
  const readOnly = isFinance(profile.role); // finance may view projects, nothing more

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) notFound();

  const [
    { data: milestones },
    { data: updates },
    { data: deliverables },
    { data: client },
    { data: staffList },
    { data: assignments },
  ] = await Promise.all([
    supabase
      .from("project_milestones")
      .select("*")
      .eq("project_id", id)
      .order("created_at"),
    supabase
      .from("project_updates")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("deliverables")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("email, company_name, full_name")
      .eq("id", project.client_id)
      .single(),
    isAdmin
      ? supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("role", "staff")
      : Promise.resolve({ data: [] }),
    isAdmin
      ? supabase
          .from("project_assignments")
          .select("id, staff_id, profiles(id, full_name, email)")
          .eq("project_id", id)
      : Promise.resolve({ data: [] }),
  ]);

  // Resolve author names for updates
  const authorIds = [...new Set((updates ?? []).map((u) => u.author_id))];
  const { data: authors } = authorIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, email, role")
        .in("id", authorIds)
    : { data: [] };
  const authorMap = new Map(
    (authors ?? []).map((a) => [
      a.id,
      isOperationalStaff(a.role)
        ? "Team"
        : a.full_name || a.email,
    ])
  );

  const updatesWithAuthor = (updates ?? []).map((u: ProjectUpdate) => ({
    ...u,
    author_name: authorMap.get(u.author_id) ?? "Team",
  }));

  const clientLabel =
    client?.company_name || client?.full_name || client?.email || "Unknown";

  return (
    <div className="ux-page">
      <Link href="/admin/projects" className="ux-back">
        ← Projects
      </Link>

      <EditProject project={project as Project} clientLabel={clientLabel} clientHref={`/admin/clients/${project.client_id}`} readOnly={readOnly} />

      {isAdmin && (
        <StaffAssignments
          projectId={id}
          staff={(staffList ?? []) as { id: string; full_name: string | null; email: string }[]}
          assignments={(assignments ?? []).map((a: { id: string; staff_id: string; profiles?: { id: string; full_name: string | null; email: string }[] }) => ({
            id: a.id,
            staff_id: a.staff_id,
            profiles: (Array.isArray(a.profiles) ? a.profiles[0] : (a.profiles as unknown as { id: string; full_name: string | null; email: string } | undefined)) ?? null,
          })) as { id: string; staff_id: string; profiles: { id: string; full_name: string | null; email: string } | null }[]}
        />
      )}

      <div>
        <MilestonesSection
          projectId={id}
          milestones={(milestones ?? []) as Milestone[]}
          readOnly={readOnly}
        />
        {!readOnly && (
          <DeliverablesSection
            projectId={id}
            deliverables={(deliverables ?? []) as Deliverable[]}
            isStaff
          />
        )}
      </div>

      {!readOnly && <UpdatesSection projectId={id} updates={updatesWithAuthor} isStaff />}
    </div>
  );
}
