interface Props {
  cot: string;
  status: string;
  busy: boolean;
}

export function CotStream({ cot, status, busy }: Props) {
  if (!cot && !busy) return null;
  return (
    <div className="rounded-md bg-slate-900 text-slate-100 text-xs p-3 font-mono whitespace-pre-wrap max-h-64 overflow-auto">
      <div className="flex items-center gap-2 mb-1 text-slate-400">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            busy ? "bg-green-400 animate-pulse" : "bg-slate-500"
          }`}
        />
        <span className="uppercase tracking-wide">{status || "idle"}</span>
      </div>
      {cot || (busy ? "Designing component…" : "")}
    </div>
  );
}
