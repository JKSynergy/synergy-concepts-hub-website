import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import InviteForm from "./invite-form";
import AddClientForm from "./add-client-form";

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

  const isAdmin = profile.role === "admin";

  const { data: clients } = await supabase
    .from("profiles")
    .select("id, email, full_name, company_name, phone, external_portal_url, created_at")
    .eq("role", "client")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
      </div>

      <div className="flex flex-wrap gap-3">
        <AddClientForm />
        <InviteForm />
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Company
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Phone
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                External Portal
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {clients && clients.length > 0 ? (
              clients.map((c) => (
                <tr key={c.id}>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {c.company_name ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {c.full_name ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{c.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {c.phone ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
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
                      "—"
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-8 text-center text-sm text-gray-500"
                >
                  No clients yet. Invite your first client above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
