import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AddStaffForm from "./invite-staff-form";
import { EmptyState, PageHeader, Section, StatusMark } from "@/components/ux/primitives";
import { isAdmin as isAdminRole, isFinance } from "@/lib/security/roles";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function StaffPage() {
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

  if (!profile || !isAdminRole(profile.role)) {
    redirect("/admin");
  }

  const { data: staff, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, created_at, archived_at")
    .in("role", ["staff", "finance"])
    .order("created_at", { ascending: false });

  const list = staff ?? [];

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Team"
        description="Team members with staff or finance access to the portal. Only administrators can manage this page."
        actions={<AddStaffForm />}
      />

      <Section title="Team members" aside={<span className="ux-muted" style={{ fontSize: 13 }}>{list.length} member{list.length === 1 ? "" : "s"}</span>}>
        {error ? (
          <div className="ux-notice ux-notice--error">
            Unable to load team members. <a className="ux-link" href="/admin/staff">Try again</a>
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            title="No team members yet"
            action={<AddStaffForm />}
          >
            No staff or finance team members have been added yet.
          </EmptyState>
        ) : (
          <div className="ux-tablewrap">
            <table className="ux-table ux-table--stack">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.full_name ? (
                        <span className="ux-cell-main">{s.full_name}</span>
                      ) : (
                        <span className="ux-cell-main ux-muted" style={{ fontWeight: 400 }}>Name not set</span>
                      )}
                    </td>
                    <td data-label="Email" style={{ overflowWrap: "anywhere" }}>{s.email}</td>
                    <td data-label="Role">
                      <StatusMark>{isFinance(s.role) ? "Finance" : "Staff"}</StatusMark>
                      {s.archived_at && <span className="ux-cell-sub">Archived</span>}
                    </td>
                    <td data-label="Added" className="ux-muted">{s.created_at ? fmtDate(s.created_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
