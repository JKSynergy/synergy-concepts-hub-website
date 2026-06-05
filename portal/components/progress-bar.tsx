export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="w-full">
      <div className="mb-1 flex justify-between text-xs text-gray-500">
        <span>Progress</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-sch-orange transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
