import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import {
  INVOICE_STATUS_BADGE,
  type InvoiceStatus,
} from "@/lib/types";

export default async function AdminFinancesPage() {
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
    redirect("/admin");
  }

  const [
    { data: invoices },
    { data: payments },
    { data: clients },
  ] = await Promise.all([
    supabase.from("invoices").select("id, invoice_number, status, total, subtotal, tax_amount, tax_rate, due_date, issue_date, client_id").order("created_at", { ascending: false }),
    supabase.from("payments").select("id, amount, method, paid_at, invoice_id, created_at").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, company_name, full_name, email"),
  ]);

  const clientMap = new Map(
    (clients ?? []).map((c) => [c.id, c.company_name || c.full_name || c.email])
  );

  const invoiceList = invoices ?? [];
  const paymentList = payments ?? [];

  // KPIs
  const totalRevenue = paymentList.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalInvoiced = invoiceList.reduce((sum, i) => sum + Number(i.total), 0);
  const outstanding = invoiceList
    .filter((i) => ["sent", "overdue", "draft"].includes(i.status))
    .reduce((sum, i) => sum + Number(i.total), 0);
  const paidInvoicesTotal = invoiceList
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + Number(i.total), 0);

  // Invoice status breakdown
  const statusCounts: Record<string, number> = {};
  const statusTotals: Record<string, number> = {};
  for (const inv of invoiceList) {
    statusCounts[inv.status] = (statusCounts[inv.status] || 0) + 1;
    statusTotals[inv.status] = (statusTotals[inv.status] || 0) + Number(inv.total);
  }

  // Monthly revenue from payments
  const monthlyRevenue: Record<string, number> = {};
  for (const p of paymentList) {
    const month = new Date(p.created_at).toLocaleString("en-US", {
      month: "short",
      year: "numeric",
    });
    monthlyRevenue[month] = (monthlyRevenue[month] || 0) + Number(p.amount);
  }
  const sortedMonths = Object.entries(monthlyRevenue).sort(
    (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()
  );
  const maxMonthly = Math.max(...Object.values(monthlyRevenue), 1);

  // Payment methods breakdown
  const methodTotals: Record<string, number> = {};
  for (const p of paymentList) {
    methodTotals[p.method] = (methodTotals[p.method] || 0) + Number(p.amount);
  }

  // Overdue invoices
  const today = new Date().toISOString().split("T")[0];
  const overdueInvoices = invoiceList.filter(
    (i) => i.status === "overdue" || (i.due_date && i.due_date < today && i.status !== "paid" && i.status !== "cancelled")
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Finances</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-6 shadow">
          <div className="text-sm font-medium text-gray-500">Total Revenue</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            UGX {totalRevenue.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-gray-400">Payments received</div>
        </div>
        <div className="rounded-xl bg-white p-6 shadow">
          <div className="text-sm font-medium text-gray-500">Outstanding</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            UGX {outstanding.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-gray-400">Unpaid / pending invoices</div>
        </div>
        <div className="rounded-xl bg-white p-6 shadow">
          <div className="text-sm font-medium text-gray-500">Total Invoiced</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            UGX {totalInvoiced.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-gray-400">All invoices combined</div>
        </div>
        <div className="rounded-xl bg-white p-6 shadow">
          <div className="text-sm font-medium text-gray-500">Collection Rate</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            {totalInvoiced > 0 ? Math.round((paidInvoicesTotal / totalInvoiced) * 100) : 0}%
          </div>
          <div className="mt-1 text-xs text-gray-400">Paid vs invoiced</div>
        </div>
      </div>

      {/* Monthly Revenue & Payment Methods */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Monthly Revenue</h2>
          {sortedMonths.length > 0 ? (
            <div className="space-y-3">
              {sortedMonths.slice(-6).map(([month, amount]) => (
                <div key={month}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-gray-600">{month}</span>
                    <span className="font-medium text-gray-900">
                      UGX {amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full bg-emerald-500"
                      style={{ width: `${(amount / maxMonthly) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-sm text-gray-500">No payments yet.</div>
          )}
        </div>

        <div className="rounded-xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Payment Methods</h2>
          {Object.keys(methodTotals).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(methodTotals).map(([method, amount]) => (
                <div key={method} className="flex items-center justify-between">
                  <span className="text-sm capitalize text-gray-600">
                    {method.replace(/_/g, " ")}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    UGX {amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-sm text-gray-500">No payments yet.</div>
          )}

          <h2 className="mb-4 mt-6 text-lg font-semibold text-gray-900">Invoice Status</h2>
          {["draft", "sent", "paid", "overdue", "cancelled"].map((status) => {
            const count = statusCounts[status] || 0;
            const total = statusTotals[status] || 0;
            return (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm capitalize text-gray-600">{status}</span>
                <span className="text-sm font-medium text-gray-900">
                  {count} • UGX {total.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Payments */}
      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent Payments</h2>
        <div className="space-y-3">
          {paymentList.slice(0, 10).length > 0 ? (
            paymentList.slice(0, 10).map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 p-4"
              >
                <div>
                  <span className="font-medium text-gray-900">
                    UGX {Number(p.amount).toLocaleString()}
                  </span>
                  <span className="ml-2 text-xs capitalize text-gray-500">
                    {p.method.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-sm text-gray-500">
                  {new Date(p.created_at).toLocaleDateString()}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-sm text-gray-500">No payments yet.</div>
          )}
        </div>
      </div>

      {/* Overdue Invoices */}
      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Overdue Invoices</h2>
        <div className="space-y-3">
          {overdueInvoices.length > 0 ? (
            overdueInvoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/admin/invoices/${inv.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50 p-4 hover:bg-red-100"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {inv.invoice_number ?? "—"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        INVOICE_STATUS_BADGE[inv.status as InvoiceStatus]
                      }`}
                    >
                      {inv.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {clientMap.get(inv.client_id) ?? "Unknown"} • UGX{" "}
                    {Number(inv.total).toLocaleString()}
                  </p>
                </div>
                <span className="text-xs text-red-600">
                  Due: {new Date(inv.due_date!).toLocaleDateString()}
                </span>
              </Link>
            ))
          ) : (
            <div className="text-center text-sm text-gray-500">No overdue invoices.</div>
          )}
        </div>
      </div>
    </div>
  );
}
