import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import InviteForm from "./invite-form";
import AddClientForm from "./add-client-form";
import ClientsTable, { type ClientRow } from "./clients-table";
import { PageHeader } from "@/components/ux/primitives";
import { canAccessFinance, isInternal, isOperationalStaff } from "@/lib/security/roles";

export default async function ClientsPage() {
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
  const canFinance = canAccessFinance(profile.role);
  const canWrite = isOperationalStaff(profile.role); // finance sees clients read-only

  const { data: clients } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, company_name, phone, billing_address, tax_id, external_portal_url, created_at"
    )
    .eq("role", "client")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  const list = clients ?? [];
  const ids = list.map((c) => c.id);

  // Active work per client (RLS already scopes what staff can see).
  const activeByClient = new Map<string, number>();
  const lastByClient = new Map<string, string>();
  const openByClient = new Map<string, number>();

  if (ids.length > 0) {
    const { data: projects } = await supabase
      .from("projects")
      .select("client_id, status, updated_at")
      .in("client_id", ids);
    for (const p of projects ?? []) {
      if (p.status === "active" || p.status === "review") {
        activeByClient.set(p.client_id, (activeByClient.get(p.client_id) ?? 0) + 1);
      }
      const prev = lastByClient.get(p.client_id);
      if (p.updated_at && (!prev || p.updated_at > prev)) lastByClient.set(p.client_id, p.updated_at);
    }

    if (canFinance) {
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, client_id, total")
        .in("client_id", ids)
        .in("status", ["sent", "partially paid", "overdue"]);
      const inv = invoices ?? [];
      const invIds = inv.map((i) => i.id);
      const paidByInvoice = new Map<string, number>();
      if (invIds.length > 0) {
        const { data: pays } = await supabase
          .from("payments")
          .select("invoice_id, amount")
          .in("invoice_id", invIds);
        for (const p of pays ?? []) {
          paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount));
        }
      }
      for (const i of inv) {
        const due = Number(i.total) - (paidByInvoice.get(i.id) ?? 0);
        if (due > 0) openByClient.set(i.client_id, (openByClient.get(i.client_id) ?? 0) + due);
      }
    }
  }

  const rows: ClientRow[] = list.map((c) => ({
    ...c,
    active_work: activeByClient.get(c.id) ?? 0,
    outstanding: canFinance ? openByClient.get(c.id) ?? 0 : null,
    last_activity: lastByClient.get(c.id) ?? c.created_at,
  }));

  return (
    <div className="ux-page ux-page--wide">
      <PageHeader
        title="Clients"
        description="The companies and people Synergy works with."
        actions={
          canWrite ? (
            <>
              <InviteForm />
              <AddClientForm />
            </>
          ) : undefined
        }
      />
      <ClientsTable rows={rows} showFinancial={canFinance} readOnly={!canWrite} />
    </div>
  );
}
