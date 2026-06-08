"use client";

import { useState } from "react";
import { SCHLoader } from "@/components/sch-loader";

export default function LoaderPreviewPage() {
  // `key` remounts the loader to replay the full loading -> success cycle
  const [runKey, setRunKey] = useState(0);
  const replay = () => setRunKey((k) => k + 1);

  return (
    <main className="min-h-screen bg-sch-black px-6 py-16 text-sch-white">
      <div className="mx-auto max-w-3xl text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sch-blue">
          Brand Component
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold">SCH Loader</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-sch-muted">
          Three orbiting segments — Systems, Media, Academy — resolving into the
          SCH mark and a success state.
        </p>

        {/* Hero */}
        <div className="mt-12 flex items-center justify-center rounded-3xl border border-sch-glass-border bg-white/[0.02] p-16">
          <SCHLoader key={runKey} size={128} label="Loading your workspace" />
        </div>

        <button
          onClick={replay}
          className="mt-6 rounded-xl bg-sch-blue px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sch-blue-dark"
        >
          Replay animation
        </button>

        {/* Size variants */}
        <h2 className="mt-16 font-display text-lg font-semibold">Sizes</h2>
        <div className="mt-6 flex flex-wrap items-end justify-center gap-12">
          <div className="flex flex-col items-center gap-3">
            <SCHLoader key={`sm-${runKey}`} size={48} autoCompleteMs={0} />
            <span className="text-xs text-sch-muted">48px · spin only</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <SCHLoader key={`md-${runKey}`} size={72} autoCompleteMs={0} />
            <span className="text-xs text-sch-muted">72px · spin only</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <SCHLoader key={`lg-${runKey}`} size={96} />
            <span className="text-xs text-sch-muted">96px · auto-complete</span>
          </div>
        </div>

        {/* Inline usage */}
        <h2 className="mt-16 font-display text-lg font-semibold">Inline</h2>
        <div className="mt-6 inline-flex items-center gap-3 rounded-xl border border-sch-glass-border bg-white/[0.02] px-5 py-3">
          <SCHLoader size={28} autoCompleteMs={0} />
          <span className="text-sm text-sch-muted">Processing payment…</span>
        </div>
      </div>
    </main>
  );
}
