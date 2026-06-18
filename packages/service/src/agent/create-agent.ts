import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { getModel, type Model } from "@earendil-works/pi-ai";
import { env } from "../env.js";
import { SYSTEM_PROMPT } from "./prompts.js";

/**
 * Build the model object. We target the local SubstrateLLMProvider proxy, which
 * exposes the OpenAI Responses API at `${LLM_BASE_URL}/responses`. We clone the
 * registry's gpt-5.5 model definition (correct reasoning / thinking config) but
 * switch its `api` to "openai-responses" and point `baseUrl` at the proxy, so
 * pi-ai uses the plain OpenAI Responses transport (the OpenAI SDK posts to
 * `${baseUrl}/responses`) instead of the Azure deployment path.
 */
function buildModel(): Model<"openai-responses"> {
  const base = getModel("azure-openai-responses", env.modelId as "gpt-5.5");
  return {
    ...base,
    api: "openai-responses",
    provider: "openai",
    baseUrl: env.llm.baseUrl,
  } as unknown as Model<"openai-responses">;
}

/**
 * Build a pi Agent wired to the local proxy with the given tools.
 */
export function createAgent(tools: AgentTool[]): Agent {
  const model = buildModel();

  return new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model,
      thinkingLevel: "medium",
      tools,
    },
    getApiKey: () => env.llm.apiKey,
  });
}
