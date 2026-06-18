# SyncBoard — PRD (v1)

> LLM 驱动的实时协同白板。用户在右侧 chat 输入需求，service 调用 LLM 生成一个 Vue 页面，编译为 JS，写入 Fluid `SharedTree`，所有客户端在左侧画布上以可拖拽 / 缩放 / 删除的 iframe 元素实时同步渲染。

本 PRD 面向后续 Copilot CLI 实现，包含：功能需求 → 技术架构 → 数据模型 → 详细 API/协议接口定义 → 里程碑。

---

## 1. 产品概述

### 1.1 一句话定义

一个「Copilot 式」双栏应用：**右栏 chat 驱动 LLM 生成 UI 组件，左栏白板实时展示并可操作这些组件，多客户端通过 Fluid 实时同步**。

### 1.2 核心体验

```
┌─────────────────────────── SyncBoard ────────────────────────────┐
│  ┌────────────────────────────────────┐ ┌──────────────────────┐ │
│  │  Canvas (左)                        │ │  Chat (右)           │ │
│  │  ┌──────────┐   ┌──────────┐        │ │  > 生成一个 todo     │ │
│  │  │ iframe:  │   │ iframe:  │        │ │  ┌────────────────┐  │ │
│  │  │ Todo     │   │ Weather  │  ← 可  │ │  │ CoT streaming… │  │ │
│  │  │ [vue app]│   │ [vue app]│  拖拽  │ │  │ 正在设计组件…  │  │ │
│  │  └──────────┘   └──────────┘  缩放  │ │  └────────────────┘  │ │
│  │       ↑ 实时同步到其他客户端 ↑      │ │  [生成中 ●●●]        │ │
│  └────────────────────────────────────┘ └──────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

### 1.3 V1 范围（MUST）

1. 在 chat 输入自然语言（如「一个 todo」），触发 service 生成。
2. service 用 pi-agent-core 驱动 LLM 生成 Vue SFC → 编译为 JS。
3. 生成过程中的 **chain-of-thought 流式推送**到发起的 client 显示。
4. 生成完成后，组件作为一个 **iframe 元素**加入白板。
5. iframe 元素可 **拖拽 / 缩放 / 删除**，操作 **实时同步**到所有客户端。
6. iframe 内的 **Vue 组件运行时 state** 也跨客户端同步（如 todo 勾选）。
7. 可 **修改已存在的 iframe**（chat 中选中某元素 → 描述改动 → 重新生成）。
8. 可 **添加多个 iframe**。

### 1.4 非目标（V1 不做）

- 用户登录 / 权限 / 多 board 管理（V1 单一固定 board）。
- 持久化到数据库（V1 用 Tinylicious 内存 relay，进程重启即清空）。
- 撤销 / 重做历史。
- 移动端适配。
- 组件市场 / 模板库。

---

## 2. 技术栈与仓库组织

### 2.1 技术栈

| 层 | 技术 |
|----|------|
| Monorepo | **pnpm workspace** |
| Client | **React + Vite + Tailwind CSS** |
| 生成的组件 | **Vue 3 SFC**（`<script setup>` + TS），service 端编译为 runtime JS |
| Service | **Fastify**（Node ≥ 22） |
| 实时同步 | **Fluid Framework** + `@fluidframework/tinylicious-client`（本地 relay） |
| 协同数据结构 | Fluid **SharedTree** |
| LLM 驱动 | **`@earendil-works/pi-agent-core`** + **`@earendil-works/pi-ai`** |
| LLM 模型 | **Azure OpenAI GPT-5.5**（key 见 §2.4） |
| SFC 编译 | **`@vue/compiler-sfc`** + **esbuild**（service 端） |
| client↔service | **WebSocket**（CoT 流式）+ REST（健康检查 / 触发） |

### 2.2 仓库结构

```
C:\src\syncboard\
├── pnpm-workspace.yaml
├── package.json                 # root，私有，scripts 编排
├── tsconfig.base.json
├── .env                          # 从 videorecapsv2 .env 拷贝相关项（见 §2.4）
├── .gitignore
├── PRD.md                        # 本文件
├── README.md
├── packages/
│   ├── shared/                   # @syncboard/shared — 共享类型 & 协议契约
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── tree-schema.ts    # SharedTree schema（client/service 共用）
│   │       ├── protocol.ts       # WS 消息类型、REST DTO
│   │       └── bridge-protocol.ts# iframe ↔ wrapper postMessage 协议
│   ├── service/                  # @syncboard/service — Fastify + pi-agent
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts          # Fastify bootstrap
│   │       ├── env.ts            # 读取 .env，构造 Azure model
│   │       ├── ws/
│   │       │   └── generate-ws.ts# /ws/generate handler
│   │       ├── agent/
│   │       │   ├── create-agent.ts   # pi Agent 工厂
│   │       │   ├── emit-tool.ts       # emit_component 自定义 AgentTool
│   │       │   ├── prompts.ts         # system prompt（约束输出 SFC 形状）
│   │       │   └── stream-bridge.ts   # agent events → WS 消息
│   │       ├── compile/
│   │       │   └── compile-sfc.ts # SFC → JS + state schema 提取
│   │       └── fluid/
│   │           └── service-client.ts # service 侧连 Fluid，写 codeTree
│   └── client/                   # @syncboard/client — React + Vite
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── tailwind.config.js
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx                # 双栏布局
│           ├── fluid/
│           │   ├── client.ts          # tinylicious client + container schema
│           │   └── useBoard.ts         # React hook：订阅 SharedTree
│           ├── canvas/
│           │   ├── Canvas.tsx          # 白板容器
│           │   ├── BoardElement.tsx    # 单个可拖拽/缩放/删除元素
│           │   └── ComponentFrame.tsx  # iframe wrapper + postMessage 桥
│           ├── chat/
│           │   ├── ChatPanel.tsx       # 右栏 chat
│           │   ├── CotStream.tsx       # CoT 流式展示
│           │   └── useGenerate.ts      # 连 /ws/generate
│           └── bridge/
│               └── state-bridge.ts     # wrapper 侧 stateTree ↔ postMessage
└── runtime/                      # iframe 内运行时模板（被 service 内联）
    └── iframe-runtime.html        # Vue runtime + CSP + 桥接 bootstrap 模板
```

### 2.3 包依赖关系

```
@syncboard/shared   ← 被 client & service 依赖（类型 & schema 单一来源）
@syncboard/service  → shared, pi-agent-core, pi-ai, fastify, @vue/compiler-sfc, esbuild, tinylicious-client, fluid-framework
@syncboard/client   → shared, react, vite, tailwind, fluid-framework, tinylicious-client
```

### 2.4 环境变量（.env）

从 `C:\src\videorecapsv2\agents\.env` 拷贝以下项到 `C:\src\syncboard\.env`：

```dotenv
# Azure OpenAI —— 此 endpoint 已确认可用 GPT-5.5
AZURE_API_KEY=<从源 .env 拷贝>
AZURE_API_BASE=https://lubob-m82m9don-swedencentral.cognitiveservices.azure.com
AZURE_API_VERSION=2025-04-01-preview
AZURE_DEPLOYMENT=gpt-5.5
```

> ✅ GPT-5.5 资源已确认：用通用 `AZURE_API_BASE` 端点（Sweden Central），deployment 名为 `gpt-5.5`。

pi-ai 的 Azure 适配读取 `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_BASE_URL`（+ 可选 `AZURE_OPENAI_API_VERSION`）。service 的 `env.ts` 负责把上面的 `AZURE_API_*` 映射成 pi-ai 期望的形式：`AZURE_OPENAI_API_KEY ← AZURE_API_KEY`、`AZURE_OPENAI_BASE_URL ← AZURE_API_BASE`、`AZURE_OPENAI_API_VERSION ← AZURE_API_VERSION`，deployment(=model id) 用 `gpt-5.5`。

---

## 3. 系统架构

### 3.1 组件总览

```
┌─────────── Browser (React/Vite/Tailwind) ───────────┐
│  ChatPanel ──WS──┐                                   │
│                  │           Canvas                  │
│                  │    ┌────────────────────────┐     │
│                  │    │ BoardElement(拖拽/缩放) │     │
│                  │    │  └ ComponentFrame       │     │
│                  │    │      └ <iframe srcdoc>  │     │
│                  │    │   (Vue app, 网络隔离)    │     │
│                  │    └──────────┬─────────────┘     │
│  Fluid Container ◀───────────────┘ postMessage 桥    │
│   ├ boardTree (元素列表/位置/尺寸/codeRef)            │
│   └ stateTree[] (每元素的运行时 state)               │
└────────┬──────────────────────────┬──────────────────┘
         │ Fluid relay (Tinylicious) │ WS (/ws/generate)
┌────────▼──────────────────────────▼──────────────────┐
│  Service (Fastify)                                    │
│   ├ /ws/generate ── pi Agent (Azure GPT-5.5)          │
│   │     ├ system prompt 约束输出 SFC                  │
│   │     ├ emit_component tool ← 模型产出 SFC          │
│   │     ├ subscribe → thinking_delta → WS(CoT)        │
│   │     └ compile-sfc → JS + stateSchema              │
│   └ fluid/service-client ── 写 boardTree + codeTree   │
└───────────────────────────────────────────────────────┘
```

### 3.2 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 谁写 Fluid | **service 写代码产物 + 创建元素；client 写位置/尺寸/删除/运行时 state** | 生成是一次性、重的；交互是高频、轻的 |
| 代码存放 | `codeTree`（每元素一条：编译后 JS + stateSchema + version） | 偶变、整体替换语义 |
| 运行时 state | `stateTree`（每元素一棵，schema 由 stateSchema 决定） | 高频、需节点级协同合并 |
| iframe 内容来源 | **service 生成 → client 用 `srcdoc` 注入**（非从域名 load） | 零网络依赖，配合隔离 |
| 网络隔离 | `sandbox="allow-scripts"` + CSP `connect-src 'none'` | iframe 彻底断网，数据只走 postMessage |
| iframe 内 state 同步 | postMessage 桥 ↔ wrapper ↔ stateTree | §7 桥接协议 |
| SFC → JS | **service 端编译**（@vue/compiler-sfc + esbuild） | LLM 自由用 SFC/TS；iframe 只跑产物 + Vue runtime |
| LLM 收口产物 | 自定义 `emit_component` tool | 结构化拿到 SFC，而非解析自由文本 |

### 3.3 生成时序（新建组件）

```
client ChatPanel ──WS open /ws/generate──▶ service
client ──{type:'generate', prompt, requestId}──▶ service
service: new Agent(azureModel, [emit_component], systemPrompt)
service: agent.subscribe(ev):
          ev=thinking_delta ──WS{type:'cot', delta}──▶ client (CotStream 显示)
          ev=tool_execution_start(emit_component) ──WS{type:'status','compiling'}
service: agent.prompt(prompt)
          模型调用 emit_component({ name, sfcSource, summary })
service: compile-sfc(sfcSource) → { js, stateSchema, codeVersion }
service: fluidClient.boardTree.insert(element{ id, name, x,y,w,h, codeRef })
         fluidClient.codeTree.set(codeRef, { js, stateSchema, codeVersion })
         fluidClient.stateTree.initIfAbsent(id, stateSchema)
service ──WS{type:'done', elementId}──▶ client
   ▼ Fluid relay 广播 boardTree/codeTree 变更
所有 client: useBoard 收到新元素 → 渲染 BoardElement → ComponentFrame
         读 codeRef → 组 srcdoc(Vue runtime + js + CSP) → 注入 iframe
         iframe 'ready' 握手 → wrapper 推 stateTree 快照 → 进入双向同步
```

### 3.4 修改组件时序

```
client: 选中 elementId，chat 输入改动描述
client ──{type:'generate', prompt, requestId, targetElementId, prevSfc}──▶ service
service: agent.prompt(改动 prompt + 现有 SFC 作为上下文)
         emit_component → 新 SFC → 编译
service: codeTree.set(codeRef, { js, stateSchema, codeVersion+1 })
所有 client: codeTree 变更 → ComponentFrame 检测 codeVersion 变化
         → 销毁旧 iframe，用新 js 重建 srcdoc
         → stateTree 按新 stateSchema 迁移（新增字段给默认值）
```

---

## 4. 数据模型（SharedTree Schema）

定义在 `@syncboard/shared/src/tree-schema.ts`，**client 与 service 共用**。

### 4.1 Container 顶层结构

```
SyncBoardRoot
├── board:  BoardElement[]            // 画布上的元素（array node）
├── code:   Map<string, CodeArtifact> // key = element.id
└── state:  Map<string, StateBlob>    // key = element.id；运行时 state
```

### 4.2 BoardElement（位置/尺寸/元信息）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一 id（service 生成，nanoid） |
| `name` | string | 组件名（如 "Todo"） |
| `x` | number | 画布坐标 x |
| `y` | number | 画布坐标 y |
| `width` | number | 宽 |
| `height` | number | 高 |
| `z` | number | 层级 |
| `codeVersion` | number | 与 CodeArtifact.codeVersion 对应，用于触发 iframe 重建 |
| `createdBy` | string | client 短 id（可选，用于显示） |

> 删除元素 = 从 `board` array 移除该节点 + 删除 `code`/`state` 对应 key。

### 4.3 CodeArtifact（编译产物）

| 字段 | 类型 | 说明 |
|------|------|------|
| `js` | string | 编译后的 JS（Vue render fn + setup） |
| `stateSchema` | string | JSON 字符串，描述运行时 state 形状（字段名/类型/默认值） |
| `codeVersion` | number | 版本号，重新生成时 +1 |

> V1 用 string 节点存 `js`。若体积过大（实测 > ~100KB）再迁移到 Fluid blob + handle（见 §10 风险）。

### 4.4 StateBlob（运行时 state）

V1 采用务实方案：**`StateBlob = { json: string }`**，整棵运行时 state 序列化为 JSON 字符串存单字段。

- 优点：实现简单，stateSchema 任意形状都能存。
- 代价：失去 SharedTree 节点级合并；并发改同一组件 state 走 last-write-wins。
- V1 可接受（白板组件多为单人操作）；V2 升级为按 stateSchema 动态建强 schema 子树以获得字段级协同合并（见 §10）。

> wrapper 侧负责：本地 Vue state 变 → 序列化写 `StateBlob.json`；远端 `StateBlob.json` 变 → postMessage 推给 iframe。防回环见 §7。

---

## 5. iframe 渲染与隔离

### 5.1 srcdoc 组装（client ComponentFrame）

`ComponentFrame.tsx` 读 `CodeArtifact.js`，组装 HTML 字符串注入 `iframe.srcdoc`：

```
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none';">
  <style>/* reset */</style>
</head>
<body>
  <div id="app"></div>
  <script>/* 内联 Vue runtime（runtime-only build） */</script>
  <script>/* 内联 bridge bootstrap（见 §7） */</script>
  <script>/* 注入的 CodeArtifact.js，mount 到 #app */</script>
</body>
</html>
```

### 5.2 隔离要求（硬性）

- `<iframe sandbox="allow-scripts">`（**不给** `allow-same-origin`，得到 opaque origin）。
- CSP `connect-src 'none'`：掐断 fetch/XHR/WebSocket/EventSource/beacon。
- `referrerpolicy="no-referrer"`，不给 `allow-top-navigation`。
- CSP meta 必须是 `<head>` 第一个元素，先于任何 script。
- **LLM 生成代码视为不可信**：以上隔离不可省。

### 5.3 Vue runtime 内联

- 用 **runtime-only** build（不需 SFC 编译器，因为已在 service 编译）。
- runtime 文件随 client 构建打包，`ComponentFrame` import 其文本内容内联进 srcdoc。

---

## 6. Service 实现要点

### 6.1 pi Agent 工厂（agent/create-agent.ts）

```
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";

new Agent({
  initialState: {
    systemPrompt: SYSTEM_PROMPT,        // 约束：必须调用 emit_component 输出单个 SFC
    model: azureModel,                  // §6.2
    thinkingLevel: "medium",            // 产生 CoT 供流式展示
    tools: [emitComponentTool],
  },
});
```

- 订阅 `agent.subscribe`：
  - `message_update` 且 `assistantMessageEvent.type === 'thinking_delta'` → WS `{type:'cot', delta}`。
  - `tool_execution_start` (emit_component) → WS `{type:'status', status:'received'}`。
- `agent.prompt(userPrompt)` 结束后做编译 + 写 Fluid。

### 6.2 Azure 模型构造（env.ts）

pi-ai 支持 `azure-openai-responses`。接法：

- 在 `env.ts` 把 `AZURE_API_*` 映射为 pi-ai 的 `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_BASE_URL` / `AZURE_OPENAI_API_VERSION`，然后 `getModel('azure-openai', 'gpt-5.5')`。
- 或用 per-request `env` 覆盖（`complete(model, ctx, { env: { AZURE_OPENAI_API_KEY, AZURE_OPENAI_BASE_URL, AZURE_OPENAI_API_VERSION } })`），避免全局环境污染。

> endpoint：`https://lubob-m82m9don-swedencentral.cognitiveservices.azure.com`，apiVersion：`2025-04-01-preview`，deployment(model id)：`gpt-5.5`。

### 6.3 emit_component 自定义 tool（agent/emit-tool.ts）

```
{
  name: "emit_component",
  description: "Emit the generated Vue SFC for the requested UI component.",
  parameters: Type.Object({
    name: Type.String(),        // 组件名
    sfcSource: Type.String(),   // 完整 .vue SFC（<script setup lang=ts> + <template> + <style>）
    summary: Type.String(),     // 一句话描述
  }),
  execute: async (_id, params) => {
    // 缓存 params 供 prompt() 结束后编译；返回成功
    return { content: [{ type: "text", text: "received" }], terminate: true };
  },
}
```

- `terminate: true`：拿到组件即可结束 agent 循环，无需后续 LLM 调用。

### 6.4 SFC 编译（compile/compile-sfc.ts）

输入 `sfcSource`，输出 `{ js, stateSchema, codeVersion }`：

1. `@vue/compiler-sfc` 的 `parse` → 拆 `<script setup>` / `<template>` / `<style>`。
2. `compileScript` + `compileTemplate` → 合成组件对象。
3. **esbuild** transform：剥 TS 类型、bundle 成单个 IIFE/ESM，target ES2020。
4. 注入 mount 引导：`createApp(Component).mount('#app')`，并接 §7 桥接。
5. **提取 stateSchema**：从 `<script setup>` AST 找顶层 `ref()`/`reactive()` 声明，产出 `{ field, type, default }[]` → JSON 字符串。
6. style 内联进组件（V1 简单注入 `<style>`）。

> stateSchema 是 client 建 stateTree / iframe 桥接的依据，**必须与 js 一起产出**。

### 6.5 Fluid service client（fluid/service-client.ts）

- 用 `@fluidframework/tinylicious-client` 连同一个固定 container id（V1 单 board）。
- 提供：`insertElement(element)`、`setCode(id, artifact)`、`initState(id, stateSchema)`、`updateElementCode(id, artifact)`。

---

## 7. iframe ↔ wrapper 桥接协议（bridge-protocol.ts）

### 7.1 消息类型

```
type BridgeMsg =
  | { t: 'ready';    v: 1 }                                  // iframe → wrapper
  | { t: 'snapshot'; v: 1; state: unknown }                 // wrapper → iframe
  | { t: 'patch';    v: 1; state: unknown; opId: string }   // 双向：全量 state（V1）
  | { t: 'ack';      v: 1; opId: string };                  // 可选
```

> V1 `StateBlob` 存整 JSON，故桥接也走「全量 state」而非细粒度 path op，简化实现。V2 升级细粒度。

### 7.2 双向流 + 防回环

**iframe 内（注入的 bootstrap）：**
- `watch` 整个响应式 state（deep）→ 防回环标志为 false 时 `postMessage({t:'patch', state, opId})`。
- `onmessage`：收到 `snapshot`/`patch` → 置 `applyingRemote=true` → 覆盖本地 state → `nextTick` 复位。

**wrapper 内（state-bridge.ts）：**
- 收到 iframe `patch` → 写 `StateBlob.json`（标记本地来源）。
- 监听 stateTree：**远端**变更 → `postMessage({t:'patch', state})` 给 iframe；本地来源变更不回弹（用 Fluid 的 local/remote 标识过滤，flag 兜底）。

### 7.3 来源校验（安全）

- sandbox iframe origin 为 `"null"`，**不可用 origin 字符串校验**。
- 用 `event.source === iframe.contentWindow` 校验来源。
- 丢弃 schema 不符 / `v` 不匹配的消息。

---

## 8. 接口定义

### 8.1 WebSocket：`/ws/generate`

**连接**：`ws://<host>/ws/generate`

**Client → Service**

```
// 触发生成（新建或修改）
{
  type: "generate",
  requestId: string,           // 幂等 & 关联响应
  prompt: string,              // 用户自然语言
  targetElementId?: string,    // 存在则为「修改」，否则「新建」
  prevSfc?: string             // 修改时附带现有 SFC 作为上下文（可选）
}

// 取消
{ type: "cancel", requestId: string }
```

**Service → Client**

```
{ type: "accepted", requestId }                          // 已受理
{ type: "cot",     requestId, delta: string }            // CoT 流式增量
{ type: "status",  requestId, status: "received" | "compiling" | "writing" }
{ type: "done",    requestId, elementId: string }        // 完成
{ type: "error",   requestId, message: string }          // 失败
```

### 8.2 REST

| 方法 | 路径 | 说明 | 响应 |
|------|------|------|------|
| GET | `/health` | 健康检查 | `{ ok: true, model: string }` |
| GET | `/api/fluid/info` | 返回 Fluid container id + tinylicious 端点（client 连接用） | `{ containerId: string, endpoint: string }` |

> V1 用固定单 container；`/api/fluid/info` 让 client 拿到 id（首次由 service 创建并返回，之后复用）。

### 8.3 共享类型（@syncboard/shared/src/protocol.ts）

上述 WS / REST DTO 全部定义为 TS 类型并从 `@syncboard/shared` 导出，client 与 service 双向引用，保证契约一致。

---

## 9. 里程碑（建议实现顺序）

### M0 — 脚手架
- pnpm workspace + 三个包骨架 + tsconfig + .env。
- `@syncboard/shared` 定义 tree-schema / protocol / bridge-protocol 占位类型。
- 验收：`pnpm -r build` 通过。

### M1 — Fluid 同步打通（无 LLM）
- service 起 tinylicious；client 连 container。
- 手动在 board 插入一个「静态 HTML」元素（hardcode js），client 渲染 iframe。
- 实现拖拽 / 缩放 / 删除 → 同步到第二个浏览器标签。
- 验收：两个标签实时同步元素位置/尺寸/增删。

### M2 — LLM 生成接入
- service `/ws/generate` + pi Agent + emit_component tool + Azure 模型。
- compile-sfc 编译 SFC → JS + stateSchema。
- chat 输入 → 生成 → 新元素入 board → iframe 渲染。
- CoT 流式推送到 CotStream。
- 验收：输入「一个 todo」生成可见可交互的 todo 组件，CoT 实时显示。

### M3 — iframe 内 state 同步
- 桥接协议（postMessage ↔ stateTree）+ 防回环 + 来源校验。
- 验收：A 标签勾选 todo，B 标签同步勾选。

### M4 — 修改组件
- 选中元素 + chat 改动 → 重新生成 → codeVersion +1 → iframe 重建 + state 迁移。
- 验收：对已有 todo 说「加一个清空按钮」，所有标签更新且原 state 保留。

---

## 10. 已知风险与决议

| 风险 | V1 处理 | V2 升级 |
|------|---------|---------|
| 编译产物大 → SharedTree string 节点 | 直接存 string，实测体积 | 迁移 Fluid blob + handle |
| StateBlob 整 JSON → 无字段级合并 | 接受 LWW（单人操作为主） | 按 stateSchema 动态建强 schema 子树 |
| LLM 代码不可信 | sandbox + CSP `connect-src 'none'` 强制 | 同 + 静态扫描 |
| state schema 漂移 | service 编译时与 js 一起产出 stateSchema，client 据此建树 | schemaVersion + 迁移策略 |
| Tinylicious 仅内存 | V1 可接受（演示） | 换正式 Fluid relay + 持久化 |
| 高频拖拽产生大量 op | 拖拽中本地渲染，停止时 commit（throttle/debounce） | 同 |

---

## 11. 给实现者的关键提醒

1. **`@syncboard/shared` 是契约单一来源**：tree-schema、WS/REST DTO、bridge-protocol 都在这里，先定稳再写两端。
2. **stateSchema 必须由 service 编译时产出**并写入 `CodeArtifact`，否则 client 无法建 stateTree / 桥接 iframe。
3. **iframe 隔离不可省**：`sandbox="allow-scripts"`（无 same-origin）+ CSP `connect-src 'none'`，来源校验用 `event.source`。
4. **codeVersion 驱动 iframe 重建**：client 监听到 `BoardElement.codeVersion` 变化才销毁重建 iframe。
5. **pi 用的是 `@earendil-works/pi-agent-core` + `@earendil-works/pi-ai`**，不是 coding-agent。CoT 来自 `thinking_delta` 事件，产物用 `emit_component` 自定义 tool 收口。
6. **GPT-5.5 用通用 `AZURE_API_BASE`（Sweden Central）+ deployment `gpt-5.5`**；`env.ts` 把 `AZURE_API_*` 映射成 pi-ai 的 `AZURE_OPENAI_*`。
7. **安装第三方依赖前做供应链安全核对**（参见根 CLAUDE.md / copilot-instructions），逐个披露 publisher / 漏洞 / 下载量 / 风险评级后再安装。
