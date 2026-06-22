import type { EmittedComponent } from "./emit-tool.js";

const MAX_RECENT_TURNS = 6;
const COMPACT_PREFIX = "Compacted older requests:";

export interface HistoryTurn {
  requestId: string;
  userPrompt: string;
  assistantSummary: string;
  emittedName: string;
  codeVersion: number;
  createdAt: number;
}

export interface ComponentHistory {
  sfcSource: string;
  historySummary: string;
  recentTurns: HistoryTurn[];
}

export interface StoredHistory {
  sfcSource: string;
  historySummary: string;
  recentTurnsJson: string;
}

export function emptyHistory(): ComponentHistory {
  return { sfcSource: "", historySummary: "", recentTurns: [] };
}

export function parseRecentTurns(json: string): HistoryTurn[] {
  if (!json) return [];
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isHistoryTurn);
}

function isHistoryTurn(v: unknown): v is HistoryTurn {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Partial<HistoryTurn>;
  return (
    typeof t.requestId === "string" &&
    typeof t.userPrompt === "string" &&
    typeof t.assistantSummary === "string" &&
    typeof t.emittedName === "string" &&
    typeof t.codeVersion === "number" &&
    typeof t.createdAt === "number"
  );
}

export function readHistory(stored?: StoredHistory): ComponentHistory {
  if (!stored) return emptyHistory();
  let recentTurns: HistoryTurn[] = [];
  try {
    recentTurns = parseRecentTurns(stored.recentTurnsJson);
  } catch {
    recentTurns = [];
  }
  return {
    sfcSource: stored.sfcSource,
    historySummary: stored.historySummary,
    recentTurns,
  };
}

export function serializeRecentTurns(turns: HistoryTurn[]): string {
  return JSON.stringify(turns);
}

export function appendHistoryTurn(
  history: ComponentHistory,
  input: {
    requestId: string;
    userPrompt: string;
    emitted: EmittedComponent;
    codeVersion: number;
    createdAt?: number;
  },
): ComponentHistory {
  const nextTurn: HistoryTurn = {
    requestId: input.requestId,
    userPrompt: input.userPrompt,
    assistantSummary: input.emitted.summary,
    emittedName: input.emitted.name || "Component",
    codeVersion: input.codeVersion,
    createdAt: input.createdAt ?? Date.now(),
  };

  const turns = [...history.recentTurns, nextTurn];
  if (turns.length <= MAX_RECENT_TURNS) {
    return {
      sfcSource: input.emitted.sfcSource,
      historySummary: history.historySummary,
      recentTurns: turns,
    };
  }

  const compacted = turns.slice(0, turns.length - MAX_RECENT_TURNS);
  const recentTurns = turns.slice(-MAX_RECENT_TURNS);
  return {
    sfcSource: input.emitted.sfcSource,
    historySummary: compactHistory(history.historySummary, compacted),
    recentTurns,
  };
}

export function compactHistory(
  existingSummary: string,
  turnsToCompact: HistoryTurn[],
): string {
  const lines = existingSummary.trim()
    ? [existingSummary.trim()]
    : [COMPACT_PREFIX];
  for (const turn of turnsToCompact) {
    lines.push(
      `- v${turn.codeVersion} (${new Date(turn.createdAt).toISOString()}): user asked "${turn.userPrompt}"; component "${turn.emittedName}" became ${turn.assistantSummary}.`,
    );
  }
  return lines.join("\n");
}

export function buildGenerationPrompt(input: {
  prompt: string;
  history?: ComponentHistory;
}): string {
  const history = input.history ?? emptyHistory();
  if (!history.sfcSource) {
    return `Create a component for this request: "${input.prompt}". Emit it via emit_component.`;
  }

  const recent = history.recentTurns.length
    ? history.recentTurns
        .map(
          (turn) =>
            `- v${turn.codeVersion}: user asked "${turn.userPrompt}"; result: ${turn.assistantSummary}`,
        )
        .join("\n")
    : "(none)";

  const compact = history.historySummary.trim() || "(none)";

  return `Modify the existing component per this request: "${input.prompt}".

Persisted compact history:
${compact}

Recent raw requests:
${recent}

Current SFC:
\`\`\`vue
${history.sfcSource}
\`\`\`

Emit the full updated SFC via emit_component. Preserve existing state field names whenever possible so current runtime data survives.`;
}
