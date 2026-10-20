"use client";

import { PRIORITY_LABEL, type ResponseTarget } from "@/lib/billing/response-targets";

export const DEFAULT_TARGETS: ResponseTarget[] = [
  { priority: "critical", example: "System unavailable or major business function stopped", target: "Within 2 business hours", hours: 2 },
  { priority: "high", example: "Significant function impaired", target: "Within 4 business hours", hours: 4 },
  { priority: "normal", example: "Minor defect or user issue", target: "Within 1 business day", hours: 9 },
  { priority: "change", example: "New feature or material change", target: "Assessment and quotation", hours: null },
];

/** One row per priority. Clearing a row's target text removes it on save. */
export function withAllPriorities(targets: ResponseTarget[]): ResponseTarget[] {
  return DEFAULT_TARGETS.map((d) => targets.find((t) => t.priority === d.priority) ?? { ...d, target: "", example: d.example })
}

export function TargetsEditor({ value, onChange }: { value: ResponseTarget[]; onChange: (v: ResponseTarget[]) => void }) {
  const set = (i: number, patch: Partial<ResponseTarget>) => onChange(value.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <div className="ag-target-ed">
      {value.map((t, i) => (
        <div key={t.priority} className="ag-target-row">
          <span className="ag-pri">
            <span className={`bl-pri is-${t.priority}`} /> {PRIORITY_LABEL[t.priority]}
          </span>
          <input className="ux-input" aria-label={`${PRIORITY_LABEL[t.priority]} example`} placeholder="Example" value={t.example ?? ""} onChange={(e) => set(i, { example: e.target.value })} />
          <input className="ux-input" aria-label={`${PRIORITY_LABEL[t.priority]} target`} placeholder="e.g. Within 4 business hours" value={t.target} onChange={(e) => set(i, { target: e.target.value })} />
          <input
            className="ux-input"
            inputMode="decimal"
            aria-label={`${PRIORITY_LABEL[t.priority]} hours`}
            placeholder="hrs"
            value={t.hours ?? ""}
            onChange={(e) => set(i, { hours: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </div>
      ))}
      <p className="bl-meta">Hours are business hours, Mon–Fri 08:00–17:00 EAT (1 business day = 9). Leave hours blank for no time target; clear the target text to drop a priority.</p>
    </div>
  );
}
