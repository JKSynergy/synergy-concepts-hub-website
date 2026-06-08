export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="w-full">
      <div
        className="mb-1.5 flex justify-between text-xs"
        style={{ color: "var(--p-muted)" }}
      >
        <span>Progress</span>
        <span style={{ color: "var(--p-text-strong)", fontWeight: 600 }}>{pct}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: "rgba(148,163,184,0.12)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, #1da1f2, #4cc9f0)",
            boxShadow: "0 0 12px rgba(29,161,242,0.5)",
          }}
        />
      </div>
    </div>
  );
}
