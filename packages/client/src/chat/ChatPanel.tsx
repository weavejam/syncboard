import { useState } from "react";
import type { GenerateApi } from "./useGenerate.js";
import { CotStream } from "./CotStream.js";

export interface AgentHistoryTurn {
  requestId: string;
  userPrompt: string;
  assistantSummary: string;
  emittedName: string;
  codeVersion: number;
  createdAt: number;
}

export interface AgentHistoryView {
  compactSummary: string;
  recentTurns: AgentHistoryTurn[];
}

interface Props {
  gen: GenerateApi;
  selectedId: string | null;
  selectedName: string | null;
  selectedLockedBy?: string;
  agentHistory?: AgentHistoryView;
  onClearSelection: () => void;
}

export function ChatPanel({
  gen,
  selectedId,
  selectedName,
  selectedLockedBy,
  agentHistory,
  onClearSelection,
}: Props) {
  const [input, setInput] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt || gen.busy || selectedLockedBy) return;
    gen.generate(prompt, selectedId ?? undefined);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full w-[360px] shrink-0 border-l border-slate-200 bg-white">
      <header className="px-4 h-12 flex items-center border-b border-slate-200">
        <h1 className="font-semibold text-slate-800">SyncBoard</h1>
        <span className="ml-auto text-xs text-slate-400">chat → component</span>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        <p className="text-sm text-slate-500">
          Describe a UI component (e.g. <em>“a todo list”</em>). It will be
          generated and placed on the board, synced to everyone.
        </p>
        <CotStream cot={gen.cot} status={gen.status} busy={gen.busy} />
        {gen.error && (
          <div className="rounded-md bg-red-50 text-red-700 text-xs p-3">
            {gen.error}
          </div>
        )}
        {selectedId && <AgentHistory history={agentHistory} />}
      </div>

      {selectedId && (
        <div
          className={`px-4 py-2 text-xs flex items-center gap-2 border-t ${
            selectedLockedBy
              ? "bg-amber-50 text-amber-700 border-amber-100"
              : "bg-blue-50 text-blue-700 border-blue-100"
          }`}
        >
          <span>
            {selectedLockedBy ? "Locked" : "Editing"}:{" "}
            <strong>{selectedName ?? selectedId}</strong>
            {selectedLockedBy && <> by {selectedLockedBy}</>}
          </span>
          <button
            className="ml-auto text-blue-400 hover:text-blue-600"
            onClick={onClearSelection}
          >
            clear
          </button>
        </div>
      )}

      <form onSubmit={submit} className="p-3 border-t border-slate-200">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
          rows={3}
          placeholder={
            selectedId
              ? "Describe a change to the selected component…"
              : "Generate a component…"
          }
          className="w-full resize-none rounded-md border border-slate-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <div className="flex gap-2 mt-2">
          <button
            type="submit"
            disabled={gen.busy || !input.trim() || !!selectedLockedBy}
            className="flex-1 rounded-md bg-blue-600 text-white text-sm py-2 disabled:opacity-40 hover:bg-blue-700"
          >
            {gen.busy
              ? "Generating…"
              : selectedLockedBy
                ? "Locked"
                : selectedId
                  ? "Update"
                  : "Generate"}
          </button>
          {gen.busy && (
            <button
              type="button"
              onClick={gen.cancel}
              className="rounded-md border border-slate-300 text-sm px-3 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function AgentHistory({ history }: { history?: AgentHistoryView }) {
  const recentTurns = history?.recentTurns ?? [];
  const compactSummary = history?.compactSummary.trim() ?? "";
  const hasHistory = compactSummary || recentTurns.length > 0;

  return (
    <section className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-slate-700">Agent history</h2>
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          {recentTurns.length} recent
        </span>
      </div>
      {!hasHistory ? (
        <p className="text-slate-400">
          No persisted generation history yet. Generate or update this component
          to add turns here.
        </p>
      ) : (
        <div className="space-y-3">
          {compactSummary && (
            <div>
              <div className="mb-1 font-medium text-slate-500">
                Compacted summary
              </div>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-[11px] leading-relaxed text-slate-600">
                {compactSummary}
              </pre>
            </div>
          )}
          {recentTurns.length > 0 && (
            <div className="space-y-2">
              <div className="font-medium text-slate-500">Recent requests</div>
              {[...recentTurns].reverse().map((turn) => (
                <article
                  key={turn.requestId}
                  className="rounded bg-white p-2 shadow-sm ring-1 ring-slate-100"
                >
                  <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-400">
                    <span>v{turn.codeVersion}</span>
                    <span>·</span>
                    <time>{formatTime(turn.createdAt)}</time>
                  </div>
                  <div className="font-medium text-slate-700">
                    {turn.userPrompt}
                  </div>
                  <div className="mt-1 text-slate-500">
                    {turn.assistantSummary}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function formatTime(value: number): string {
  if (!Number.isFinite(value)) return "";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
