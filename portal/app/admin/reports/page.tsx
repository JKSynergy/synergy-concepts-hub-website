import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NavLink as Link } from "@/components/nav-link";
import {
  INVOICE_STATUS_BADGE,
  BOOKING_STATUS_BADGE,
  BOOKING_TYPE_LABEL,
  type InvoiceStatus,
  type BookingStatus,
  type BookingType,
} from "@/lib/types";

function csvEscape(val: string | number | null) {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export default async function AdminReportsPage() {
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
    { data: invoiceSummary },
    { data: bookingSummary },
    { data: recentInvoices },
    { data: recentBookings },
    { data: clients },
  ] = await Promise.all([
    supabase.from("invoices").select("status, total"),
    supabase.from("bookings").select("type, status"),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, total, issue_date, client_id")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("bookings")
      .select("id, title, type, status, created_at, client_id")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("profiles").select("id, company_name, full_name, email").eq("role", "client"),
  ]);

  const clientMap = new Map(
    (clients ?? []).map((c) => [c.id, c.company_name || c.full_name || c.email])
  );

  // Summaries
  const totalRevenue = (invoiceSummary ?? [])
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + Number(i.total), 0);

  const outstanding = (invoiceSummary ?? [])
    .filter((i) => ["sent", "overdue", "draft"].includes(i.status))
    .reduce((sum, i) => sum + Number(i.total), 0);

  const bookingCounts = (bookingSummary ?? []).reduce(
    (acc, b) => {
      acc[b.type as BookingType] = (acc[b.type as BookingType] || 0) + 1;
      return acc;
    },
    {} as Record<BookingType, number>
  );

  // CSV data
  const invoiceCsv = [
    "Invoice Number,Status,Total,Issue Date,Client",
    ...(recentInvoices ?? []).map(
      (i) =>
        `${csvEscape(i.invoice_number)},${csvEscape(i.status)},${csvEscape(i.total)},${csvEscape(i.issue_date)},${csvEscape(clientMap.get(i.client_id))}`
    ),
  ].join("\n");

  const bookingCsv = [
    "Title,Type,Status,Created At,Client",
    ...(recentBookings ?? []).map(
      (b) =>
        `${csvEscape(b.title)},${csvEscape(BOOKING_TYPE_LABEL[b.type as BookingType])},${csvEscape(b.status)},${csvEscape(new Date(b.created_at).toLocaleDateString())},${csvEscape(clientMap.get(b.client_id))}`
    ),
  ].join("\n");

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Reports</h1>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-6 shadow">
          <div className="text-sm font-medium text-gray-500">Total Revenue</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            UGX {totalRevenue.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl bg-white p-6 shadow">
          <div className="text-sm font-medium text-gray-500">Outstanding</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            UGX {outstanding.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl bg-white p-6 shadow">
          <div className="text-sm font-medium text-gray-500">Total Bookings</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            {(bookingSummary ?? []).length}
          </div>
        </div>
        <div className="rounded-xl bg-white p-6 shadow">
          <div className="text-sm font-medium text-gray-500">Clients</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">
            {(clients ?? []).length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Booking Types</h2>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(bookingCsv)}`}
              download="bookings.csv"
              className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
            >
              Export CSV
            </a>
          </div>
          <div className="space-y-2">
            {Object.entries(bookingCounts).map(([type, count]) => (
              <div key={type} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  {BOOKING_TYPE_LABEL[type as BookingType]}
                </span>
                <span className="text-sm font-medium text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Invoice Status</h2>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(invoiceCsv)}`}
              download="invoices.csv"
              className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
            >
              Export CSV
            </a>
          </div>
          <div className="space-y-2">
            {["draft", "sent", "paid", "overdue", "cancelled"].map((status) => {
              const count = (invoiceSummary ?? []).filter(
                (i) => i.status === status
              ).length;
              return (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 capitalize">{status}</span>
                  <span className="text-sm font-medium text-gray-900">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent Invoices</h2>
        <div className="space-y-3">
          {recentInvoices && recentInvoices.length > 0 ? (
            recentInvoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/admin/invoices/${inv.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 p-4 hover:bg-gray-50"
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
                <span className="text-xs text-gray-400">
                  {inv.issue_date ? new Date(inv.issue_date).toLocaleDateString() : ""}
                </span>
              </Link>
            ))
          ) : (
            <div className="text-center text-sm text-gray-500">No invoices yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
