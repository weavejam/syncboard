/**
 * postMessage protocol between the sandboxed iframe (the running Vue app)
 * and its wrapper (ComponentFrame). V1 exchanges the whole state as JSON.
 */

export const BRIDGE_VERSION = 1 as const;

/** iframe -> wrapper: the app has mounted and is ready to receive state. */
export interface ReadyMsg {
  t: "ready";
  v: typeof BRIDGE_VERSION;
}

/** wrapper -> iframe: full initial state snapshot. */
export interface SnapshotMsg {
  t: "snapshot";
  v: typeof BRIDGE_VERSION;
  state: unknown;
}

/** bidirectional: full state update (V1 coarse-grained). */
export interface PatchMsg {
  t: "patch";
  v: typeof BRIDGE_VERSION;
  state: unknown;
  opId: string;
}

/** optional acknowledgement. */
export interface AckMsg {
  t: "ack";
  v: typeof BRIDGE_VERSION;
  opId: string;
}

export type BridgeMsg = ReadyMsg | SnapshotMsg | PatchMsg | AckMsg;

export function isBridgeMsg(v: unknown): v is BridgeMsg {
  if (typeof v !== "object" || v === null) return false;
  const m = v as { t?: unknown; v?: unknown };
  if (m.v !== BRIDGE_VERSION) return false;
  return (
    m.t === "ready" || m.t === "snapshot" || m.t === "patch" || m.t === "ack"
  );
}
