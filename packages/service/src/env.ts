import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env lives at repo root (two levels up from packages/service/src).
loadDotenv({ path: resolve(__dirname, "../../../.env") });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/**
 * Map the repo's AZURE_API_* vars onto the names pi-ai's azure-openai-responses
 * provider expects, so we don't have to duplicate them in .env.
 */
function mapAzureEnv(): void {
  if (!process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_API_KEY) {
    process.env.AZURE_OPENAI_API_KEY = process.env.AZURE_API_KEY;
  }
  if (!process.env.AZURE_OPENAI_BASE_URL && process.env.AZURE_API_BASE) {
    process.env.AZURE_OPENAI_BASE_URL = process.env.AZURE_API_BASE;
  }
  if (!process.env.AZURE_OPENAI_API_VERSION && process.env.AZURE_API_VERSION) {
    process.env.AZURE_OPENAI_API_VERSION = process.env.AZURE_API_VERSION;
  }
}

mapAzureEnv();

export const env = {
  port: Number(process.env.PORT ?? 8787),
  tinyliciousPort: Number(process.env.TINYLICIOUS_PORT ?? 7070),
  /** Model id (proxy deployment / model name). */
  modelId: process.env.AZURE_DEPLOYMENT ?? "gpt-5.5",
  /**
   * LLM endpoint. Points at the local SubstrateLLMProvider proxy, which speaks
   * the OpenAI Responses API at `${baseUrl}/responses`.
   */
  llm: {
    baseUrl: required("LLM_BASE_URL"),
    apiKey: required("LLM_API_KEY"),
  },
} as const;
