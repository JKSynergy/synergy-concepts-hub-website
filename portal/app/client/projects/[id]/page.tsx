import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ProgressBar } from "@/components/progress-bar";
import ClientMilestones from "./client-milestones";
import UpdatesSection from "@/components/updates-section";
import DeliverablesSection from "@/components/deliverables-section";
import {
  STATUS_BADGE,
  type ProjectStatus,
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

  return (
    <div className="space-y-6">
      <Link
        href="/client/projects"
        className="text-sm text-sch-blue hover:underline"
      >
        ← Back to My Projects
      </Link>

      <div className="rounded-xl bg-white p-6 shadow">
        <div className="flex items-start justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{project.title}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
              STATUS_BADGE[project.status as ProjectStatus]
            }`}
          >
            {project.status}
          </span>
        </div>
        {project.description && (
          <p className="mt-3 text-sm text-gray-600">{project.description}</p>
        )}
        <div className="mt-4 max-w-md">
          <ProgressBar value={project.progress_percent} />
        </div>
        {project.target_date && (
          <p className="mt-3 text-xs text-gray-400">
            Target completion:{" "}
            {new Date(project.target_date).toLocaleDateString()}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ClientMilestones
          projectId={id}
          milestones={(milestones ?? []) as Milestone[]}
        />
        <DeliverablesSection
          projectId={id}
          deliverables={(deliverables ?? []) as Deliverable[]}
          isStaff={false}
        />
      </div>

      <UpdatesSection
        projectId={id}
        updates={updatesWithAuthor}
        isStaff={false}
      />
    </div>
  );
}
