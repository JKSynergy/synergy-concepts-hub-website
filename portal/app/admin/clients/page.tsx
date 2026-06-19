import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import InviteForm from "./invite-form";
import AddClientForm from "./add-client-form";
import ClientActions from "./client-actions";

export default async function ClientsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "staff")) {
    redirect("/client");
  }

  const { data: clients } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, company_name, phone, billing_address, tax_id, external_portal_url, created_at"
    )
    .eq("role", "client")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold" style={{ color: "var(--p-text-strong)" }}>
          Clients
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--p-muted)" }}>
          Manage client accounts, contact details, and portal access
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium" style={{ color: "var(--p-text-strong)" }}>
          {clients?.length || 0} client{clients?.length !== 1 ? "s" : ""}
        </div>
        <div className="flex flex-wrap gap-3">
          <AddClientForm />
          <InviteForm />
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--p-border)" }}>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--p-muted)" }}>
                  Company
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--p-muted)" }}>
                  Name
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--p-muted)" }}>
                  Email
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--p-muted)" }}>
                  Phone
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--p-muted)" }}>
                  External Portal
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--p-muted)" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {clients && clients.length > 0 ? (
                clients.map((c) => (
                  <tr
                    key={c.id}
                    className="transition-colors hover:bg-white/5"
                    style={{ borderBottom: "1px solid var(--p-border)" }}
                  >
                    <td className="px-6 py-4 text-sm font-medium" style={{ color: "var(--p-text-strong)" }}>
                      {c.company_name ?? "—"}
                    </td>
                    <td className="px-6 py-4 text-sm" style={{ color: "var(--p-text)" }}>
                      {c.full_name ?? "—"}
                    </td>
                    <td className="px-6 py-4 text-sm" style={{ color: "var(--p-muted)" }}>
                      {c.email}
                    </td>
                    <td className="px-6 py-4 text-sm" style={{ color: "var(--p-muted)" }}>
                      {c.phone ?? "—"}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {c.external_portal_url ? (
                        <a
                          href={c.external_portal_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sch-blue hover:underline"
                        >
                          Open →
                        </a>
                      ) : (
                        <span style={{ color: "var(--p-muted)" }}>—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <ClientActions client={c} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <p className="text-base font-medium" style={{ color: "var(--p-text-strong)" }}>
                      No clients yet
                    </p>
                    <p className="mt-1 text-sm" style={{ color: "var(--p-muted)" }}>
                      Add or invite your first client above
                    </p>
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
