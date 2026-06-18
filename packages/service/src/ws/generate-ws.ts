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
import { buildUserPrompt } from "../agent/prompts.js";
import { compileSfc } from "../compile/compile-sfc.js";
import {
  insertElement,
  updateElementCode,
  getCurrentCodeVersion,
} from "../fluid/service-client.js";
import type { Agent } from "@earendil-works/pi-agent-core";

const DEFAULT_W = 340;
const DEFAULT_H = 280;

/** In-memory cache of the last SFC source per element, for modify context. */
const sfcStore = new Map<string, string>();

export function registerGenerateWs(app: FastifyInstance): void {
  app.get("/ws/generate", { websocket: true }, (socket: WebSocket) => {
    const active = new Map<string, Agent>();

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
        active.get(msg.requestId)?.abort();
        return;
      }

      void handleGenerate(msg, send, active);
    });

    socket.on("close", () => {
      for (const agent of active.values()) agent.abort();
      active.clear();
    });
  });
}

async function handleGenerate(
  msg: Extract<ClientMessage, { type: "generate" }>,
  send: (m: ServerMessage) => void,
  active: Map<string, Agent>,
): Promise<void> {
  const { requestId, prompt, targetElementId } = msg;
  const prevSfc =
    msg.prevSfc ?? (targetElementId ? sfcStore.get(targetElementId) : undefined);
  send({ type: "accepted", requestId });

  const emit = createEmitTool();
  const agent = createAgent([emit.tool]);
  active.set(requestId, agent);
  const unsubscribe = bridgeAgentEvents(agent, requestId, send);

  try {
    await agent.prompt(buildUserPrompt(prompt, prevSfc));

    const emitted = emit.getResult();
    if (!emitted) {
      send({ type: "error", requestId, message: "Model did not emit a component." });
      return;
    }

    send({ type: "status", requestId, status: "compiling" });
    const { js, stateSchema } = await compileSfc(emitted.sfcSource);

    send({ type: "status", requestId, status: "writing" });

    if (targetElementId) {
      const nextVersion = getCurrentCodeVersion(targetElementId) + 1;
      updateElementCode(
        targetElementId,
        { js, stateSchema, codeVersion: nextVersion },
        "",
      );
      sfcStore.set(targetElementId, emitted.sfcSource);
      send({ type: "done", requestId, elementId: targetElementId });
    } else {
      const id = nanoid(10);
      insertElement(
        {
          id,
          name: emitted.name || "Component",
          x: 40 + Math.round(Math.random() * 120),
          y: 40 + Math.round(Math.random() * 120),
          width: DEFAULT_W,
          height: DEFAULT_H,
          z: Date.now(),
          codeVersion: 1,
          createdBy: "service",
        },
        { js, stateSchema, codeVersion: 1 },
        "",
      );
      sfcStore.set(id, emitted.sfcSource);
      send({ type: "done", requestId, elementId: id });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    send({ type: "error", requestId, message });
  } finally {
    unsubscribe();
    active.delete(requestId);
  }
}
