"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { assignStaff, removeStaffAssignment } from "@/lib/actions/projects";
import { useFeedback } from "@/components/ux/feedback";
import { EmptyState, Section } from "@/components/ux/primitives";

interface StaffMember {
  id: string;
  full_name: string | null;
  email: string;
}

interface Assignment {
  id: string;
  staff_id: string;
  profiles: { id: string; full_name: string | null; email: string } | null;
}

export default function StaffAssignments({
  projectId,
  staff,
  assignments,
}: {
  projectId: string;
  staff: StaffMember[];
  assignments: Assignment[];
}) {
  const router = useRouter();
  const { toast, confirm: askConfirm } = useFeedback();
  const [loading, setLoading] = useState(false);
  const assigned = new Set(assignments.map((a) => a.staff_id));
  const available = staff.filter((s) => !assigned.has(s.id));

  async function add(formData: FormData) {
    setLoading(true);
    const res = await assignStaff(projectId, formData);
    setLoading(false);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast("Team member assigned");
    router.refresh();
  }

  async function remove(a: Assignment) {
    const name = a.profiles?.full_name || a.profiles?.email || "this person";
    const ok = await askConfirm({
      title: `Remove ${name} from this project?`,
      body: "They will no longer see this project. Their earlier updates stay.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    const res = await removeStaffAssignment(a.id);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    toast("Removed from project");
    router.refresh();
  }

  return (
    <Section title="Assigned team">
      {assignments.length === 0 ? (
        <EmptyState title="No one assigned">Staff only see projects they are assigned to.</EmptyState>
      ) : (
        <div>
          {assignments.map((a) => (
            <div key={a.id} className="ux-row" style={{ cursor: "default" }}>
              <span className="ux-row-main">
                {a.profiles?.full_name || a.profiles?.email || "Unknown"}
                {a.profiles?.full_name && <small>{a.profiles.email}</small>}
              </span>
              <button type="button" className="ux-textbtn ux-textbtn--danger" onClick={() => remove(a)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <form action={add} className="ux-inline-form">
          <label className="ux-field" style={{ flex: 1, maxWidth: 360 }}>
            <span>Assign a team member</span>
            <select name="staff_id" required defaultValue="" className="ux-input ux-select">
              <option value="" disabled>
                Select a team member
              </option>
              {available.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name || s.email}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={loading} className="ux-btn ux-btn--secondary">
            {loading ? "Assigning…" : "Assign"}
          </button>
        </form>
      )}
    </Section>
  );
}
