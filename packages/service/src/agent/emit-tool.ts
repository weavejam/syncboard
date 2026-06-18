import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";

export interface EmittedComponent {
  name: string;
  sfcSource: string;
  summary: string;
}

export interface EmitTool {
  tool: AgentTool;
  /** Resolves once the model has emitted a component (or undefined if none). */
  getResult: () => EmittedComponent | undefined;
}

/**
 * Custom tool the model calls to hand back the generated SFC. Captures the
 * params so the service can compile them once the agent loop terminates.
 */
export function createEmitTool(): EmitTool {
  let captured: EmittedComponent | undefined;

  const tool: AgentTool = {
    name: "emit_component",
    label: "Emit Component",
    description:
      "Emit the generated Vue SFC for the requested UI component. Call this exactly once.",
    parameters: Type.Object({
      name: Type.String({ description: "Component name, e.g. 'Todo'." }),
      sfcSource: Type.String({
        description:
          "The complete .vue SFC: <script setup lang='ts'> + <template> (+ optional <style>).",
      }),
      summary: Type.String({ description: "One-sentence description." }),
    }),
    execute: async (_toolCallId, params) => {
      captured = params as EmittedComponent;
      return {
        content: [{ type: "text", text: "received" }],
        details: {},
        terminate: true,
      };
    },
  };

  return { tool, getResult: () => captured };
}
