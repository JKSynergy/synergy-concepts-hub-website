import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import AddStaffForm from "./invite-staff-form";

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

  if (!profile || profile.role !== "admin") {
    redirect("/client");
  }

  const { data: staff } = await supabase
    .from("profiles")
    .select("id, full_name, email, created_at")
    .eq("role", "staff")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold" style={{ color: "var(--p-text-strong)" }}>Staff</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--p-muted)" }}>
          Manage your team members and their access permissions
        </p>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div className="text-sm font-medium" style={{ color: "var(--p-text-strong)" }}>
          {staff?.length || 0} staff member{staff?.length !== 1 ? "s" : ""}
        </div>
        <AddStaffForm />
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--p-border)" }}>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--p-muted)" }}>
                  Name
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--p-muted)" }}>
                  Email
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--p-muted)" }}>
                  Added
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--p-muted)" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {staff && staff.length > 0 ? (
                staff.map((s) => (
                  <tr
                    key={s.id}
                    className="transition-colors hover:bg-white/5"
                    style={{ borderBottom: "1px solid var(--p-border)" }}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold" style={{ background: "rgba(14, 165, 233, 0.15)", color: "#0ea5e9" }}>
                          {(s.full_name || "U").charAt(0).toUpperCase()}
                        </div>
                        <div className="text-sm font-medium" style={{ color: "var(--p-text-strong)" }}>
                          {s.full_name || "Not set"}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm" style={{ color: "var(--p-text)" }}>{s.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm" style={{ color: "var(--p-muted)" }}>
                        {s.created_at
                          ? new Date(s.created_at).toLocaleDateString()
                          : "N/A"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => alert("Remove staff functionality coming soon")}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:bg-red-500/10"
                        style={{ color: "#ef4444" }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-16">
                    <div className="flex flex-col items-center justify-center gap-4 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "rgba(14, 165, 233, 0.1)", border: "1px solid rgba(14, 165, 233, 0.2)" }}>
                        <svg className="h-8 w-8" style={{ color: "#0ea5e9" }} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.258 3.052m0 0a6.062 6.062 0 00-2.837-2.734A12.02 12.02 0 013.096 9.003H2.25a9 9 0 009 9v.003" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-base font-medium" style={{ color: "var(--p-text-strong)" }}>
                          No staff members yet
                        </p>
                        <p className="mt-1 text-sm" style={{ color: "var(--p-muted)" }}>
                          Get started by inviting or manually adding your first team member
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
