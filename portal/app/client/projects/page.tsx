import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ProgressBar } from "@/components/progress-bar";
import { STATUS_BADGE, type ProjectStatus } from "@/lib/types";

export default async function ClientProjectsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS ensures only the client's own projects are returned
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, status, progress_percent, target_date")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Projects</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {projects && projects.length > 0 ? (
          projects.map((p) => (
            <Link
              key={p.id}
              href={`/client/projects/${p.id}`}
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
            No projects yet.
          </div>
        )}
      </div>
    </div>
  );
}
