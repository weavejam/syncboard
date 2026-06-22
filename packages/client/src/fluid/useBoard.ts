import { useEffect, useRef, useState } from "react";
import { Tree } from "fluid-framework";
import type { SyncBoardRoot } from "@syncboard/shared";
import { connectBoard, type BoardConnection } from "./client.js";

export interface ElementSnapshot {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  codeVersion: number;
}

export interface LockSnapshot {
  elementId: string;
  requestId: string;
  ownerClientId: string;
  phase: string;
  startedAt: number;
  expiresAt: number;
}

export interface BoardApi {
  status: "connecting" | "ready" | "error";
  error?: string;
  elements: ElementSnapshot[];
  locks: LockSnapshot[];
  root: SyncBoardRoot | null;
  /** Bump on any tree change; consumers can use as a re-read signal. */
  revision: number;
  updateElement: (id: string, patch: Partial<ElementSnapshot>) => void;
  deleteElement: (id: string) => void;
  bringToFront: (id: string) => void;
  lockFor: (id: string) => LockSnapshot | undefined;
}

function snapshot(root: SyncBoardRoot): ElementSnapshot[] {
  return [...root.board].map((e) => ({
    id: e.id,
    name: e.name,
    x: e.x,
    y: e.y,
    width: e.width,
    height: e.height,
    z: e.z,
    codeVersion: e.codeVersion,
  }));
}

function lockSnapshot(root: SyncBoardRoot): LockSnapshot[] {
  return [...root.locks].map(([elementId, lock]) => ({
    elementId,
    requestId: lock.requestId,
    ownerClientId: lock.ownerClientId,
    phase: lock.phase,
    startedAt: lock.startedAt,
    expiresAt: lock.expiresAt,
  }));
}

export function useBoard(): BoardApi {
  const [status, setStatus] = useState<BoardApi["status"]>("connecting");
  const [error, setError] = useState<string>();
  const [elements, setElements] = useState<ElementSnapshot[]>([]);
  const [locks, setLocks] = useState<LockSnapshot[]>([]);
  const [revision, setRevision] = useState(0);
  const connRef = useRef<BoardConnection | null>(null);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;

    connectBoard()
      .then((conn) => {
        if (disposed) return;
        connRef.current = conn;
        const refresh = () => {
          setElements(snapshot(conn.root));
          setLocks(lockSnapshot(conn.root));
          setRevision((r) => r + 1);
        };
        unsubscribe = Tree.on(conn.root, "treeChanged", refresh);
        refresh();
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (disposed) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  const findEl = (id: string) => {
    const root = connRef.current?.root;
    if (!root) return undefined;
    return [...root.board].find((e) => e.id === id);
  };

  const updateElement: BoardApi["updateElement"] = (id, patch) => {
    const el = findEl(id);
    if (!el) return;
    if (patch.x !== undefined) el.x = patch.x;
    if (patch.y !== undefined) el.y = patch.y;
    if (patch.width !== undefined) el.width = patch.width;
    if (patch.height !== undefined) el.height = patch.height;
    if (patch.z !== undefined) el.z = patch.z;
  };

  const deleteElement: BoardApi["deleteElement"] = (id) => {
    const root = connRef.current?.root;
    if (!root) return;
    const idx = [...root.board].findIndex((e) => e.id === id);
    if (idx >= 0) root.board.removeAt(idx);
    root.code.delete(id);
    root.state.delete(id);
  };

  const bringToFront: BoardApi["bringToFront"] = (id) => {
    const el = findEl(id);
    if (el) el.z = Date.now();
  };

  const lockFor: BoardApi["lockFor"] = (id) =>
    locks.find((lock) => lock.elementId === id && lock.expiresAt > Date.now());

  return {
    status,
    error,
    elements,
    locks,
    root: connRef.current?.root ?? null,
    revision,
    updateElement,
    deleteElement,
    bringToFront,
    lockFor,
  };
}
