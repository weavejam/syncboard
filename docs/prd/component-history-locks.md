# Component History, Compaction, and Generation Locks

## Overview

SyncBoard component generation should become history-aware and concurrency-safe. Each generated component will retain a compacted evolution history so later update requests can build on prior user intent, while a per-component generation lock prevents concurrent agentic loops from racing on the same component.

## Motivation

The current implementation creates a fresh agent for every request and only keeps the latest SFC in an in-memory `sfcStore`. This means update requests lose prior user intent after service restart and can behave as if the component was designed from scratch. Concurrent updates can also overlap: two users can trigger updates on the same component at the same time, causing stale prompts, competing writes, and confusing UI state.

## Requirements

1. Persist component generation context with the board session.
2. Store the latest SFC source alongside compiled JS so modification survives service restarts.
3. Maintain a compact history summary plus a bounded set of recent raw turns per component.
4. Build update prompts from compact summary, recent turns, current SFC, and the latest user request.
5. Do not store chain-of-thought in history; store only user prompts and concise assistant summaries.
6. Add a per-component generation lock so only one agent loop can run for a component at a time.
7. Enforce locking server-side before starting the agent, not just in the UI.
8. Release locks on success, error, cancellation, and websocket disconnect.
9. Use a lease/expiry to prevent permanent lockouts if the service crashes mid-generation.
10. Expose lock state through SharedTree so all clients can show in-progress/locked state.
11. Disable the Update button in the client when the selected component is locked.
12. Preserve the existing new-component and update-component user experience.

## Acceptance Criteria

1. Creating a component stores compiled JS, state schema, SFC source, compact summary, recent turns, and code version in Fluid.
2. Updating a component after service restart still has access to the current SFC and history from Fluid.
3. Update prompts include the prior compact summary and recent turns.
4. Successful updates append a history turn and compact old turns when the recent-turn limit is exceeded.
5. CoT/thinking deltas are not persisted in Fluid history.
6. If one user starts updating a component, a second update for the same component is rejected with a clear lock error until the first finishes.
7. Locks are removed after success, failure, cancellation, or connection close.
8. Expired locks can be replaced by a new request.
9. Clients show locked/generating state for locked elements and disable update for a locked selected element.
10. `pnpm -r build` passes.

## Technical Approach

### SharedTree model

Extend `CodeArtifact` with:

- `sfcSource: string`
- `historySummary: string`
- `recentTurnsJson: string`

Add a lock map to `SyncBoardRoot`:

- `locks: Map<string, GenerationLock>`

`GenerationLock` stores `elementId`, `requestId`, `ownerClientId`, `phase`, `startedAt`, and `expiresAt`. The lock map key is `elementId`.

### Server flow

`/ws/generate` acquires a lock before creating the agent:

- Existing component: `elementId = targetElementId`
- New component: pre-allocate an `elementId` for the lock and final element

If a non-expired lock exists for the element, the service returns an error. If a lock exists but is expired, the service replaces it.

After successful generation:

1. Compile SFC.
2. Compute next history using `current CodeArtifact + new request + emitted component`.
3. Write updated `CodeArtifact` and `BoardElement.codeVersion`.
4. Release lock.

On cancellation, websocket close, and errors, abort the agent and release active locks.

### History and compaction

Add `service/src/agent/history.ts` with:

- `buildGenerationPrompt`
- `appendHistoryTurn`
- `compactHistory`
- JSON parse/serialize helpers

V1 compaction is deterministic, not another LLM call: it turns older raw turns into a concise markdown summary and keeps the most recent turns raw. This avoids recursive model calls and keeps latency predictable. The summary retains component purpose, confirmed user constraints, preserved state fields, and prior modification requests.

### Client behavior

`useBoard` reads `root.locks` into a lock snapshot and exposes helper state. `ChatPanel` disables Update when the selected component is locked and shows a lock message. `BoardElement` displays a small generating/locked badge.

### Error handling

Lock acquire/release is server-authoritative. Invalid or missing target components return explicit errors. JSON parse failures for legacy/empty recent-turn data fall back to an empty list with valid defaults.

## Testing Strategy

1. Type/build validation: `pnpm -r build`.
2. Unit-ish deterministic validation via TypeScript build coverage for schema/protocol changes.
3. Manual/e2e websocket validation:
   - create component
   - update component
   - attempt concurrent update and verify lock error
   - verify lock releases after done/error/cancel
4. Browser validation:
   - locked selected component disables Update
   - another component remains editable

## Out of Scope

1. Durable database persistence beyond the current Fluid/Tinylicious board session.
2. LLM-powered history summarization.
3. Queueing multiple update requests for the same component.
4. Cross-service-instance distributed locking beyond the single service writer used by V1.
5. Storing or replaying chain-of-thought.
