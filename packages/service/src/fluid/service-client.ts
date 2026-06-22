import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import {
  SharedTree,
  type ContainerSchema,
  type TreeView,
} from "fluid-framework";
import {
  SyncBoardRoot,
  BoardElement,
  CodeArtifact,
  StateBlob,
  GenerationLock,
  treeConfiguration,
  initialTree,
} from "@syncboard/shared";
import { env } from "../env.js";

const containerSchema = {
  initialObjects: { appTree: SharedTree },
} satisfies ContainerSchema;

export interface ServiceFluid {
  containerId: string;
  view: TreeView<typeof SyncBoardRoot>;
  root: SyncBoardRoot;
}

export interface CodeArtifactInput {
  js: string;
  stateSchema: string;
  codeVersion: number;
  sfcSource: string;
  historySummary: string;
  recentTurnsJson: string;
}

export interface GenerationLockInput {
  elementId: string;
  requestId: string;
  ownerClientId: string;
  phase: string;
  startedAt: number;
  expiresAt: number;
}

let singleton: ServiceFluid | null = null;

function makeClient(): TinyliciousClient {
  return new TinyliciousClient({
    connection: { port: env.tinyliciousPort },
  });
}

/**
 * Create (once) the single shared container and initialize its tree.
 * The id is handed to clients via GET /api/fluid/info.
 */
export async function getOrCreateFluid(): Promise<ServiceFluid> {
  if (singleton) return singleton;

  const client = makeClient();
  const { container } = await client.createContainer(containerSchema, "2");
  const view = container.initialObjects.appTree.viewWith(treeConfiguration);
  view.initialize(initialTree());

  const containerId = await container.attach();
  singleton = { containerId, view, root: view.root };
  return singleton;
}

function fluid(): ServiceFluid {
  if (!singleton) throw new Error("Fluid container not initialized");
  return singleton;
}

/** Insert a new element + its code + initial state in one logical step. */
export function insertElement(
  element: {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    z: number;
    codeVersion: number;
    createdBy: string;
  },
  artifact: CodeArtifactInput,
  initialStateJson: string,
): void {
  const { root } = fluid();
  root.board.insertAtEnd(new BoardElement(element));
  root.code.set(element.id, new CodeArtifact(artifact));
  root.state.set(element.id, new StateBlob({ json: initialStateJson }));
}

/** Replace an element's compiled code and bump its version. */
export function updateElementCode(
  id: string,
  artifact: CodeArtifactInput,
  initialStateJson: string,
): void {
  const { root } = fluid();
  root.code.set(id, new CodeArtifact(artifact));
  const el = [...root.board].find((e) => e.id === id);
  if (el) el.codeVersion = artifact.codeVersion;
  // Seed state only if absent (preserve existing runtime state on modify).
  if (!root.state.has(id)) {
    root.state.set(id, new StateBlob({ json: initialStateJson }));
  }
}

export function getElement(id: string): BoardElement | undefined {
  return [...fluid().root.board].find((e) => e.id === id);
}

export function getCurrentCodeVersion(id: string): number {
  return fluid().root.code.get(id)?.codeVersion ?? 0;
}

export function getCodeArtifact(id: string): CodeArtifact | undefined {
  return fluid().root.code.get(id);
}

export function acquireGenerationLock(
  lock: GenerationLockInput,
): { ok: true } | { ok: false; existing: GenerationLock } {
  const { root } = fluid();
  const existing = root.locks.get(lock.elementId);
  if (existing && existing.expiresAt > Date.now()) {
    return { ok: false, existing };
  }
  root.locks.set(lock.elementId, new GenerationLock(lock));
  return { ok: true };
}

export function updateGenerationLockPhase(
  elementId: string,
  requestId: string,
  phase: string,
  expiresAt: number,
): void {
  const lock = fluid().root.locks.get(elementId);
  if (lock && lock.requestId === requestId) {
    lock.phase = phase;
    lock.expiresAt = expiresAt;
  }
}

export function releaseGenerationLock(elementId: string, requestId: string): void {
  const { root } = fluid();
  const lock = root.locks.get(elementId);
  if (lock && lock.requestId === requestId) {
    root.locks.delete(elementId);
  }
}
