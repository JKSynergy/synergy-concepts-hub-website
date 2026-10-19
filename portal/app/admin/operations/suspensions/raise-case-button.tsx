"use client";

import { Plus } from "lucide-react";

/** Fired by the page header; SuspensionsManager listens and opens its "Raise case" dialog. */
export const RAISE_CASE_EVENT = "sch:raise-suspension-case";

export function RaiseCaseButton() {
  return (
    <button
      type="button"
      className="ux-btn ux-btn--primary hx-raise"
      onClick={() => window.dispatchEvent(new Event(RAISE_CASE_EVENT))}
    >
      <Plus size={15} aria-hidden="true" /> Raise case
    </button>
  );
}
