import Fastify from "fastify";
import websocket from "@fastify/websocket";
import cors from "@fastify/cors";
import { env } from "./env.js";
import type { FluidInfoResponse, HealthResponse } from "@syncboard/shared";
import { getOrCreateFluid } from "./fluid/service-client.js";
import { registerGenerateWs } from "./ws/generate-ws.js";

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  app.get("/health", async (): Promise<HealthResponse> => {
    return { ok: true, model: env.modelId };
  });

  app.get("/api/fluid/info", async (): Promise<FluidInfoResponse> => {
    const fluid = await getOrCreateFluid();
    return {
      containerId: fluid.containerId,
      endpoint: `http://localhost:${env.tinyliciousPort}`,
    };
  });

  registerGenerateWs(app);

  // Best-effort: create the shared container up front so the id is ready.
  try {
    const fluid = await getOrCreateFluid();
    app.log.info({ containerId: fluid.containerId }, "Fluid container ready");
  } catch (err) {
    app.log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Fluid container not ready yet (is tinylicious running?); will retry on demand",
    );
  }

  await app.listen({ port: env.port, host: "0.0.0.0" });
  app.log.info(`SyncBoard service listening on http://localhost:${env.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
