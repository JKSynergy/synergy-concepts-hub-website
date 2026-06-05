import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import NewProjectForm from "./new-project-form";
import { ProgressBar } from "@/components/progress-bar";
import { STATUS_BADGE, type ProjectStatus } from "@/lib/types";

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

  if (!profile || (profile.role !== "admin" && profile.role !== "staff")) {
    redirect("/client");
  }

  const isAdmin = profile.role === "admin";

  const { data: clients } = await supabase
    .from("profiles")
    .select("id, email, company_name, full_name")
    .eq("role", "client")
    .order("company_name");

  let projectQuery = supabase
    .from("projects")
    .select("id, title, status, progress_percent, target_date, client_id")
    .order("created_at", { ascending: false });

  if (!isAdmin) {
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Projects</h1>

      {isAdmin && <NewProjectForm clients={clientOptions} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects && projects.length > 0 ? (
          projects.map((p) => (
            <Link
              key={p.id}
              href={`/admin/projects/${p.id}`}
              className="block rounded-xl bg-white p-5 shadow transition hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-gray-900">{p.title}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                    STATUS_BADGE[p.status as ProjectStatus]
                  }`}
                >
                  {p.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {clientMap.get(p.client_id) ?? "Unknown client"}
              </p>
              <div className="mt-4">
                <ProgressBar value={p.progress_percent} />
              </div>
              {p.target_date && (
                <p className="mt-3 text-xs text-gray-400">
                  Target: {new Date(p.target_date).toLocaleDateString()}
                </p>
              )}
            </Link>
          ))
        ) : (
          <div className="col-span-full rounded-xl bg-white p-8 text-center text-sm text-gray-500 shadow">
            No projects yet. Create your first project above.
          </div>
        )}
      </div>
    </div>
  );
}
