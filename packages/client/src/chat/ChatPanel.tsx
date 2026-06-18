import { useState } from "react";
import type { GenerateApi } from "./useGenerate.js";
import { CotStream } from "./CotStream.js";

interface Props {
  gen: GenerateApi;
  selectedId: string | null;
  selectedName: string | null;
  onClearSelection: () => void;
}

export function ChatPanel({
  gen,
  selectedId,
  selectedName,
  onClearSelection,
}: Props) {
  const [input, setInput] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt || gen.busy) return;
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
      </div>

      {selectedId && (
        <div className="px-4 py-2 text-xs bg-blue-50 text-blue-700 flex items-center gap-2 border-t border-blue-100">
          <span>
            Editing: <strong>{selectedName ?? selectedId}</strong>
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
            disabled={gen.busy || !input.trim()}
            className="flex-1 rounded-md bg-blue-600 text-white text-sm py-2 disabled:opacity-40 hover:bg-blue-700"
          >
            {gen.busy ? "Generating…" : selectedId ? "Update" : "Generate"}
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
