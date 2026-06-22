import { useState } from "react";
import { useBoard } from "./fluid/useBoard.js";
import { useGenerate } from "./chat/useGenerate.js";
import { Canvas } from "./canvas/Canvas.js";
import {
  ChatPanel,
  type AgentHistoryTurn,
  type AgentHistoryView,
} from "./chat/ChatPanel.js";

function parseAgentHistory(
  rawSummary: string | undefined,
  rawTurns: string | undefined,
): AgentHistoryView {
  let recentTurns: AgentHistoryTurn[] = [];
  if (rawTurns) {
    try {
      const parsed = JSON.parse(rawTurns) as unknown;
      if (Array.isArray(parsed)) {
        recentTurns = parsed.filter(isAgentHistoryTurn);
      }
    } catch {
      recentTurns = [];
    }
  }
  return {
    compactSummary: rawSummary ?? "",
    recentTurns,
  };
}

function isAgentHistoryTurn(v: unknown): v is AgentHistoryTurn {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Partial<AgentHistoryTurn>;
  return (
    typeof t.requestId === "string" &&
    typeof t.userPrompt === "string" &&
    typeof t.assistantSummary === "string" &&
    typeof t.emittedName === "string" &&
    typeof t.codeVersion === "number" &&
    typeof t.createdAt === "number"
  );
}

export default function App() {
  const board = useBoard();
  const gen = useGenerate();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const onSelect = (id: string) => setSelectedId(id || null);
  const selectedName =
    board.elements.find((e) => e.id === selectedId)?.name ?? null;
  const selectedLock = selectedId ? board.lockFor(selectedId) : undefined;
  const selectedArtifact =
    board.root && selectedId ? board.root.code.get(selectedId) : undefined;
  const selectedHistory = selectedId
    ? parseAgentHistory(
        selectedArtifact?.historySummary,
        selectedArtifact?.recentTurnsJson,
      )
    : undefined;

  return (
    <div className="flex h-full w-full">
      {board.status === "error" ? (
        <div className="flex-1 flex items-center justify-center text-red-600 text-sm p-8 text-center">
          Could not connect to the board: {board.error}
          <br />
          Is the service + tinylicious running?
        </div>
      ) : board.status === "connecting" ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          Connecting to board…
        </div>
      ) : (
        <Canvas board={board} selectedId={selectedId} onSelect={onSelect} />
      )}
      <ChatPanel
        gen={gen}
        selectedId={selectedId}
        selectedName={selectedName}
        selectedLockedBy={selectedLock?.ownerClientId}
        agentHistory={selectedHistory}
        onClearSelection={() => setSelectedId(null)}
      />
    </div>
  );
}
