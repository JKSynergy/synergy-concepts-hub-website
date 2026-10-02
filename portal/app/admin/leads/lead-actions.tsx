"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { convertLead, setLeadStatus } from "@/lib/actions/bookings";
import { useFeedback } from "@/components/ux/feedback";

export default function LeadActions({
  leadId,
  status,
  name,
  email,
}: {
  leadId: string;
  status: string;
  name?: string;
  email?: string;
}) {
  const router = useRouter();
  const { toast, confirm: askConfirm } = useFeedback();
  const [loading, setLoading] = useState(false);

  async function convert() {
    const ok = await askConfirm({
      title: "Convert to client?",
      body: `This sends an account invitation to ${email ?? "the enquirer"} and marks ${name ?? "this enquiry"} as converted.`,
      confirmLabel: "Convert and invite",
    });
    if (!ok) return;
    setLoading(true);
    const res = await convertLead(leadId);
    setLoading(false);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast("Invitation sent. Client created.");
    router.refresh();
  }

  async function mark(next: "contacted" | "archived") {
    if (next === "archived") {
      const ok = await askConfirm({
        title: "Archive enquiry?",
        body: `${name ?? "This enquiry"} will be hidden from the open list. You can still find it with the status filter.`,
        confirmLabel: "Archive",
        destructive: true,
      });
      if (!ok) return;
    }
    setLoading(true);
    const res = await setLeadStatus(leadId, next);
    setLoading(false);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast(next === "archived" ? "Enquiry archived." : "Marked as contacted.");
    router.refresh();
  }

  if (status === "converted") {
    return <span className="ux-muted">Converted to client</span>;
  }

  return (
    <div className="ux-rowactions">
      <button type="button" onClick={convert} disabled={loading} className="ux-textbtn ux-textbtn--strong">
        {loading ? "Working…" : "Convert to client"}
      </button>
      {status !== "contacted" && (
        <button type="button" onClick={() => mark("contacted")} disabled={loading} className="ux-textbtn">
          Mark contacted
        </button>
      )}
      <button type="button" onClick={() => mark("archived")} disabled={loading} className="ux-textbtn ux-textbtn--danger">
        Archive
      </button>
    </div>
  );
}
