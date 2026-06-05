import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LeadActions from "./lead-actions";
import type { Lead, LeadStatus } from "@/lib/types";

const STATUS_BADGE: Record<LeadStatus, string> = {
  new: "bg-amber-100 text-amber-700",
  contacted: "bg-blue-100 text-blue-700",
  converted: "bg-green-100 text-green-700",
  archived: "bg-gray-100 text-gray-500",
};

export default async function AdminLeadsPage() {
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

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  const typedLeads = (leads ?? []) as Lead[];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Quote Requests</h1>

      <div className="space-y-3">
        {typedLeads.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-500 shadow">
            No quote requests yet.
          </div>
        ) : (
          typedLeads.map((l) => (
            <div key={l.id} className="rounded-xl bg-white p-5 shadow">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{l.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[l.status]}`}
                    >
                      {l.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {l.email}
                    {l.phone && ` • ${l.phone}`}
                  </p>
                  {l.service_interest && (
                    <p className="mt-1 text-sm text-gray-700">
                      Interest: {l.service_interest}
                    </p>
                  )}
                  {l.message && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
                      {l.message}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-gray-400">
                    {new Date(l.created_at).toLocaleString()}
                  </p>
                </div>
                <LeadActions leadId={l.id} status={l.status} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
