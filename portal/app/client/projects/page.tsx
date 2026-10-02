import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import { EmptyState, PageHeader, PROJECT_TONE, StatusMark } from "@/components/ux/primitives";

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
    <div className="ux-page">
      <PageHeader title="Projects" description="Follow progress, milestones and deliverables for your work with us." />

      {projects && projects.length > 0 ? (
        <div className="ux-tablewrap">
          <table className="ux-table ux-table--stack">
            <thead>
              <tr>
                <th>Project</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Target date</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td data-label="Project">
                    <Link href={`/client/projects/${p.id}`} className="ux-cell-main">{p.title}</Link>
                  </td>
                  <td data-label="Status">
                    <StatusMark tone={PROJECT_TONE[p.status] ?? "neutral"}>{p.status}</StatusMark>
                  </td>
                  <td data-label="Progress">
                    <div className="ux-progress-cell">
                      <div className="ux-progress" role="progressbar" aria-valuenow={p.progress_percent ?? 0} aria-valuemin={0} aria-valuemax={100}>
                        <i style={{ width: `${p.progress_percent ?? 0}%` }} />
                      </div>
                      <span>{p.progress_percent ?? 0}%</span>
                    </div>
                  </td>
                  <td data-label="Target date">
                    {p.target_date
                      ? new Date(p.target_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No projects yet">When we start work together, your projects will appear here.</EmptyState>
      )}
    </div>
  );
}
