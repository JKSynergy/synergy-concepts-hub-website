import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { PageHeader, PROJECT_TONE, StatusMark } from "@/components/ux/primitives";
import ClientMilestones from "./client-milestones";
import UpdatesSection from "@/components/updates-section";
import DeliverablesSection from "@/components/deliverables-section";
import {
  type Milestone,
  type ProjectUpdate,
  type Deliverable,
} from "@/lib/types";

export default async function ClientProjectDetailPage({
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

  // RLS restricts this to the client's own project
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) notFound();

  const [{ data: milestones }, { data: updates }, { data: deliverables }] =
    await Promise.all([
      supabase
        .from("project_milestones")
        .select("*")
        .eq("project_id", id)
        .order("created_at"),
      // RLS does not hide internal updates, so filter them out here
      supabase
        .from("project_updates")
        .select("*")
        .eq("project_id", id)
        .eq("is_internal", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("deliverables")
        .select("*")
        .eq("project_id", id)
        .eq("is_visible_to_client", true)
        .order("created_at", { ascending: false }),
    ]);

  const updatesWithAuthor = (updates ?? []).map((u: ProjectUpdate) => ({
    ...u,
    author_name: u.author_id === user.id ? "You" : "Team",
  }));

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const done = (milestones ?? []).filter((m) => m.status === "approved").length;

  return (
    <div className="ux-page">
      <Link href="/client/projects" className="ux-back">
        ← Projects
      </Link>

      <PageHeader eyebrow="Project" title={project.title} description={project.description || undefined} />

      <div className="ux-figures">
        <div className="ux-figure">
          <span>Status</span>
          <b>
            <StatusMark tone={PROJECT_TONE[project.status] ?? "neutral"}>{project.status}</StatusMark>
          </b>
        </div>
        <div className="ux-figure">
          <span>Progress</span>
          <b>{project.progress_percent ?? 0}%</b>
        </div>
        <div className="ux-figure">
          <span>Milestones approved</span>
          <b>
            {done} of {(milestones ?? []).length}
          </b>
        </div>
        <div className="ux-figure">
          <span>Target date</span>
          <b>{project.target_date ? fmt(project.target_date) : "—"}</b>
        </div>
      </div>

      <ClientMilestones projectId={id} milestones={(milestones ?? []) as Milestone[]} />

      <DeliverablesSection
        projectId={id}
        deliverables={(deliverables ?? []) as Deliverable[]}
        isStaff={false}
        canPublish={false}
      />

      <UpdatesSection projectId={id} updates={updatesWithAuthor} isStaff={false} />
    </div>
  );
}
