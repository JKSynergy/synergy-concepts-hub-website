"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addUpdate } from "@/lib/actions/projects";
import type { ProjectUpdate } from "@/lib/types";
import { useFeedback } from "@/components/ux/feedback";
import { Section } from "@/components/ux/primitives";

interface UpdateWithAuthor extends ProjectUpdate {
  author_name?: string;
}

export default function UpdatesSection({
  projectId,
  updates,
  isStaff,
}: {
  projectId: string;
  updates: UpdateWithAuthor[];
  isStaff: boolean;
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [submitting, setSubmitting] = useState(false);

  async function action(formData: FormData) {
    setSubmitting(true);
    const res = await addUpdate(projectId, formData);
    setSubmitting(false);
    if (res.error) {
      toast(res.error, "error");
      return;
    }
    (document.getElementById("update-form") as HTMLFormElement | null)?.reset();
    toast(isStaff ? "Update posted" : "Comment posted");
    router.refresh();
  }

  return (
    <Section title={isStaff ? "Updates" : "Updates and comments"}>
      <form id="update-form" action={action} className="ux-tl-form">
        <label className="ux-field">
          <span>{isStaff ? "Post an update" : "Add a comment"}</span>
          <textarea name="content" rows={3} required className="ux-input" />
        </label>
        <div className="ux-tl-formbar">
          {isStaff ? (
            <label className="ux-tl-check">
              <input type="checkbox" name="is_internal" />
              Internal note (hidden from the client)
            </label>
          ) : (
            <span />
          )}
          <button type="submit" disabled={submitting} className="ux-btn ux-btn--primary">
            {submitting ? "Posting…" : "Post"}
          </button>
        </div>
      </form>

      {updates.length === 0 ? (
        <p className="ux-muted" style={{ margin: "24px 0 0" }}>No updates yet.</p>
      ) : (
        <ol className="ux-tl">
          {updates.map((u) => (
            <li key={u.id}>
              <div className="ux-tl-meta">
                <b>{u.author_name ?? "Team"}</b>
                {u.is_internal && <span className="ux-tl-tag">Internal</span>}
                <time dateTime={u.created_at}>
                  {/* Fixed timezone: server (UTC) and client must render identical text or React throws hydration error #418. */}
                  {new Date(u.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kampala" })}
                </time>
              </div>
              <p>{u.content}</p>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
