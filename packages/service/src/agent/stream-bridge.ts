import type { Agent } from "@earendil-works/pi-agent-core";
import type { ServerMessage } from "@syncboard/shared";

/**
 * Wire agent events to outbound WS messages for one generation request.
 * Returns an unsubscribe function.
 */
export function bridgeAgentEvents(
  agent: Agent,
  requestId: string,
  send: (msg: ServerMessage) => void,
): () => void {
  return agent.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "thinking_delta"
    ) {
      send({
        type: "cot",
        requestId,
        delta: event.assistantMessageEvent.delta,
      });
    } else if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      // Surface any narrative text as CoT too (model should mostly think).
      send({
        type: "cot",
        requestId,
        delta: event.assistantMessageEvent.delta,
      });
    } else if (
      event.type === "tool_execution_start" &&
      event.toolName === "emit_component"
    ) {
      send({ type: "status", requestId, status: "received" });
    }
  });
}
