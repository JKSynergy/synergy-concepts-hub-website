"use client";

import { useState } from "react";
import { convertLead, setLeadStatus } from "@/lib/actions/bookings";

export default function LeadActions({
  leadId,
  status,
}: {
  leadId: string;
  status: string;
}) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function convert() {
    setLoading(true);
    setMsg("");
    const res = await convertLead(leadId);
    setLoading(false);
    setMsg(res.error ? res.error : "Invite sent — client created");
  }

  if (status === "converted") {
    return <span className="text-xs text-green-600">Converted</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={convert}
        disabled={loading}
        className="rounded-md bg-sch-orange px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {loading ? "Inviting..." : "Convert to Client"}
      </button>
      {status !== "contacted" && (
        <button
          onClick={() => setLeadStatus(leadId, "contacted")}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Mark Contacted
        </button>
      )}
      <button
        onClick={() => setLeadStatus(leadId, "archived")}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
      >
        Archive
      </button>
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </div>
  );
}
