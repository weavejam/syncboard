import type { WebSocket } from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import {
  isClientMessage,
  type ClientMessage,
  type ServerMessage,
} from "@syncboard/shared";
import { createAgent } from "../agent/create-agent.js";
import { createEmitTool } from "../agent/emit-tool.js";
import { bridgeAgentEvents } from "../agent/stream-bridge.js";
import {
  appendHistoryTurn,
  buildGenerationPrompt,
  readHistory,
  serializeRecentTurns,
} from "../agent/history.js";
import { compileSfc } from "../compile/compile-sfc.js";
import {
  acquireGenerationLock,
  releaseGenerationLock,
  updateGenerationLockPhase,
  insertElement,
  updateElementCode,
  getCurrentCodeVersion,
  getCodeArtifact,
} from "../fluid/service-client.js";
import type { Agent } from "@earendil-works/pi-agent-core";

const DEFAULT_W = 340;
const DEFAULT_H = 280;
const LOCK_TTL_MS = 5 * 60 * 1000;

interface ActiveRequest {
  agent: Agent;
  elementId: string;
  requestId: string;
  cancelled: boolean;
}

export function registerGenerateWs(app: FastifyInstance): void {
  app.get("/ws/generate", { websocket: true }, (socket: WebSocket) => {
    const active = new Map<string, ActiveRequest>();

    const send = (msg: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    };

    socket.on("message", (raw: Buffer) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!isClientMessage(parsed)) return;
      const msg = parsed as ClientMessage;

      if (msg.type === "cancel") {
        const current = active.get(msg.requestId);
        if (current) {
          current.cancelled = true;
          current.agent.abort();
          releaseGenerationLock(current.elementId, current.requestId);
        }
        return;
      }

      void handleGenerate(msg, send, active);
    });

    socket.on("close", () => {
      for (const current of active.values()) {
        current.cancelled = true;
        current.agent.abort();
        releaseGenerationLock(current.elementId, current.requestId);
      }
      active.clear();
    });
  });
}

async function handleGenerate(
  msg: Extract<ClientMessage, { type: "generate" }>,
  send: (m: ServerMessage) => void,
  active: Map<string, ActiveRequest>,
): Promise<void> {
  const { requestId, prompt, targetElementId } = msg;
  const elementId = targetElementId ?? nanoid(10);
  const ownerClientId = msg.clientId ?? "unknown";
  const now = Date.now();
  const lock = acquireGenerationLock({
    elementId,
    requestId,
    ownerClientId,
    phase: "thinking",
    startedAt: now,
    expiresAt: now + LOCK_TTL_MS,
  });

  if (!lock.ok) {
    send({
      type: "locked",
      requestId,
      elementId,
      ownerClientId: lock.existing.ownerClientId,
      expiresAt: lock.existing.expiresAt,
    });
    return;
  }

  send({ type: "accepted", requestId, elementId });

  const emit = createEmitTool();
  const agent = createAgent([emit.tool]);
  const activeRequest: ActiveRequest = {
    agent,
    elementId,
    requestId,
    cancelled: false,
  };
  active.set(requestId, activeRequest);
  const unsubscribe = bridgeAgentEvents(agent, requestId, send);

  try {
    const currentArtifact = targetElementId ? getCodeArtifact(targetElementId) : undefined;
    if (targetElementId && !currentArtifact) {
      send({
        type: "error",
        requestId,
        message: `Cannot modify missing component ${targetElementId}.`,
      });
      return;
    }

    const history = readHistory(
      currentArtifact
        ? {
            sfcSource: msg.prevSfc ?? currentArtifact.sfcSource,
            historySummary: currentArtifact.historySummary,
            recentTurnsJson: currentArtifact.recentTurnsJson,
          }
        : undefined,
    );

    await agent.prompt(buildGenerationPrompt({ prompt, history }));
    if (activeRequest.cancelled) {
      send({ type: "error", requestId, message: "Generation cancelled." });
      return;
    }

    const emitted = emit.getResult();
    if (!emitted) {
      send({ type: "error", requestId, message: "Model did not emit a component." });
      return;
    }

    send({ type: "status", requestId, status: "compiling" });
    updateGenerationLockPhase(
      elementId,
      requestId,
      "compiling",
      Date.now() + LOCK_TTL_MS,
    );
    const { js, stateSchema } = await compileSfc(emitted.sfcSource);
    if (activeRequest.cancelled) {
      send({ type: "error", requestId, message: "Generation cancelled." });
      return;
    }

    send({ type: "status", requestId, status: "writing" });
    updateGenerationLockPhase(
      elementId,
      requestId,
      "writing",
      Date.now() + LOCK_TTL_MS,
    );

    if (targetElementId) {
      const nextVersion = getCurrentCodeVersion(targetElementId) + 1;
      const nextHistory = appendHistoryTurn(history, {
        requestId,
        userPrompt: prompt,
        emitted,
        codeVersion: nextVersion,
      });
      updateElementCode(
        targetElementId,
        {
          js,
          stateSchema,
          codeVersion: nextVersion,
          sfcSource: nextHistory.sfcSource,
          historySummary: nextHistory.historySummary,
          recentTurnsJson: serializeRecentTurns(nextHistory.recentTurns),
        },
        "",
      );
      send({ type: "done", requestId, elementId: targetElementId });
    } else {
      const nextHistory = appendHistoryTurn(history, {
        requestId,
        userPrompt: prompt,
        emitted,
        codeVersion: 1,
      });
      insertElement(
        {
          id: elementId,
          name: emitted.name || "Component",
          x: 40 + Math.round(Math.random() * 120),
          y: 40 + Math.round(Math.random() * 120),
          width: DEFAULT_W,
          height: DEFAULT_H,
          z: Date.now(),
          codeVersion: 1,
          createdBy: "service",
        },
        {
          js,
          stateSchema,
          codeVersion: 1,
          sfcSource: nextHistory.sfcSource,
          historySummary: nextHistory.historySummary,
          recentTurnsJson: serializeRecentTurns(nextHistory.recentTurns),
        },
        "",
      );
      send({ type: "done", requestId, elementId });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ type: "error", requestId, message });
  } finally {
    unsubscribe();
    releaseGenerationLock(elementId, requestId);
    active.delete(requestId);
  }
}
