# SyncBoard

LLM-driven realtime collaborative whiteboard. Type a request in the chat (right),
the service uses an LLM (Azure OpenAI via `@earendil-works/pi-agent-core`) to
generate a Vue 3 SFC, compiles it to runtime JS, and writes it into a Fluid
`SharedTree`. Every client renders the component as a draggable / resizable /
deletable sandboxed `<iframe>` on the canvas (left), kept in sync in realtime —
including the component's runtime state.

See [PRD.md](./PRD.md) for the full design.

## Packages

| Package | Description |
|---------|-------------|
| `@syncboard/shared`  | Contract single-source: SharedTree schema, WS/REST DTOs, iframe bridge protocol |
| `@syncboard/service` | Fastify + pi Agent (Azure) + SFC compiler + Fluid writer |
| `@syncboard/client`  | React + Vite + Tailwind UI (canvas + chat) |

## Prerequisites

- Node ≥ 22, pnpm ≥ 10
- A `.env` at the repo root with the LLM endpoint + credentials:

```dotenv
# Local SubstrateLLMProvider proxy (OpenAI Responses API)
LLM_BASE_URL=http://localhost:23671/v1
LLM_API_KEY=local-dev-key
AZURE_DEPLOYMENT=gpt-5.5           # model id sent to the proxy
PORT=8787
TINYLICIOUS_PORT=7070
```

> The service talks to the local **SubstrateLLMProvider** proxy via pi-ai's
> `openai-responses` transport: it clones the gpt-5.5 model definition but
> overrides `api` to `openai-responses` and `baseUrl` to `LLM_BASE_URL`, so the
> OpenAI SDK POSTs to `${LLM_BASE_URL}/responses` (streaming, with CoT). See
> `service/src/agent/create-agent.ts`. Start the proxy first:
> `npm run start -- --port 23671` in `C:\src\SubstrateLLMProvider`.

## Install & build

```bash
pnpm install
pnpm -r build
```

## Run

Make sure the external **SubstrateLLMProvider** proxy is running first
(`npm run start -- --port 23671` in `C:\src\SubstrateLLMProvider`).

Then start the relay + service + client with a single command:

```bash
pnpm dev            # starts relay (:7070) + service (:8787) + client (:5990)
```

Ctrl+C stops all three. (The service uses `tsx watch`; first boot takes ~30–45s
while it transpiles the Fluid dependency tree.)

Or run them in separate terminals:

```bash
pnpm dev:relay      # 1) Tinylicious Fluid relay on :7070
pnpm dev:service    # 2) Fastify service on :8787
pnpm dev:client     # 3) Vite dev server on :5990
```

Open http://localhost:5990 in two browser tabs to see realtime sync.

## Architecture (short)

- **Service writes** code artifacts + creates elements; **clients write**
  position / size / deletion / runtime state.
- Components run inside `sandbox="allow-scripts"` iframes with a strict CSP
  (`connect-src 'none'`) — generated code is treated as untrusted and has no
  network access. State flows only over `postMessage`.
- `codeVersion` on a `BoardElement` drives iframe rebuilds on modify.

## Layout

```
packages/shared/src/   tree-schema.ts · protocol.ts · bridge-protocol.ts
packages/service/src/  index.ts · env.ts · ws/ · agent/ · compile/ · fluid/
packages/client/src/   App.tsx · fluid/ · canvas/ · chat/ · bridge/
```
