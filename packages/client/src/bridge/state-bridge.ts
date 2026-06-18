import { Tree } from "fluid-framework";
import {
  BRIDGE_VERSION,
  type SyncBoardRoot,
  type SnapshotMsg,
  type PatchMsg,
} from "@syncboard/shared";

/**
 * Bridges one element's runtime state between the sandboxed iframe (full-JSON
 * postMessage protocol) and the Fluid `stateTree` StateBlob. Loop prevention:
 * we remember the last JSON we wrote locally and ignore the echo; only genuine
 * remote changes are pushed back into the iframe.
 */
export class StateBridge {
  private lastWritten: string | null = null;
  private unsubscribe?: () => void;

  constructor(
    private readonly root: SyncBoardRoot,
    private readonly elementId: string,
    /** Send a message into the iframe. */
    private readonly post: (msg: SnapshotMsg | PatchMsg) => void,
  ) {}

  /** iframe announced ready: hand it the current state (or null if none yet). */
  handleReady(): void {
    const blob = this.root.state.get(this.elementId);
    const json = blob?.json ?? "";
    let state: unknown = null;
    if (json) {
      try {
        state = JSON.parse(json);
      } catch {
        state = null;
      }
    }
    this.post({ t: "snapshot", v: BRIDGE_VERSION, state });
  }

  /** iframe pushed a local state change: persist it to the stateTree. */
  handlePatch(state: unknown): void {
    const json = JSON.stringify(state);
    this.lastWritten = json;
    const blob = this.root.state.get(this.elementId);
    if (blob) {
      blob.json = json;
    } else {
      // Create lazily if the service hasn't seeded it.
      this.root.state.set(this.elementId, { json } as never);
    }
  }

  /** Start forwarding remote stateTree changes into the iframe. */
  start(): void {
    const blob = this.root.state.get(this.elementId);
    if (!blob) return;
    this.unsubscribe = Tree.on(blob, "nodeChanged", () => {
      const current = this.root.state.get(this.elementId)?.json ?? "";
      if (current === this.lastWritten) return; // our own echo
      if (!current) return;
      try {
        const state = JSON.parse(current);
        this.post({
          t: "patch",
          v: BRIDGE_VERSION,
          state,
          opId: Math.random().toString(36).slice(2),
        });
      } catch {
        /* ignore malformed */
      }
    });
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
