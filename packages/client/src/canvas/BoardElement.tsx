import { useEffect, useRef, useState } from "react";
import type { SyncBoardRoot } from "@syncboard/shared";
import type { ElementSnapshot } from "../fluid/useBoard.js";
import { ComponentFrame } from "./ComponentFrame.js";

interface Props {
  el: ElementSnapshot;
  root: SyncBoardRoot;
  js: string;
  selected: boolean;
  canvasOrigin: number;
  renderMode: "live" | "placeholder";
  placeholderReason: "offscreen" | "small";
  lockedBy?: string;
  lockPhase?: string;
  onSelect: () => void;
  onUpdate: (patch: Partial<ElementSnapshot>) => void;
  onDelete: () => void;
  onBringToFront: () => void;
}

const MIN_W = 160;
const MIN_H = 120;

export function BoardElement({
  el,
  root,
  js,
  selected,
  canvasOrigin,
  renderMode,
  placeholderReason,
  lockedBy,
  lockPhase,
  onSelect,
  onUpdate,
  onDelete,
  onBringToFront,
}: Props) {
  const [pos, setPos] = useState({ x: el.x, y: el.y });
  const [size, setSize] = useState({ w: el.width, h: el.height });
  const [interacting, setInteracting] = useState(false);
  const interactingRef = useRef(false);

  // Sync from remote when we're not actively dragging/resizing locally.
  useEffect(() => {
    if (!interactingRef.current) setPos({ x: el.x, y: el.y });
  }, [el.x, el.y]);
  useEffect(() => {
    if (!interactingRef.current) setSize({ w: el.width, h: el.height });
  }, [el.width, el.height]);

  const beginDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    onBringToFront();
    interactingRef.current = true;
    setInteracting(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { x: pos.x, y: pos.y };
    let latest = origin;

    const onMove = (ev: MouseEvent) => {
      latest = {
        x: origin.x + (ev.clientX - startX),
        y: origin.y + (ev.clientY - startY),
      };
      setPos(latest);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      interactingRef.current = false;
      setInteracting(false);
      onUpdate({ x: latest.x, y: latest.y });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const beginResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    interactingRef.current = true;
    setInteracting(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { w: size.w, h: size.h };
    let latest = origin;

    const onMove = (ev: MouseEvent) => {
      latest = {
        w: Math.max(MIN_W, origin.w + (ev.clientX - startX)),
        h: Math.max(MIN_H, origin.h + (ev.clientY - startY)),
      };
      setSize(latest);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      interactingRef.current = false;
      setInteracting(false);
      onUpdate({ width: latest.w, height: latest.h });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className={`absolute flex flex-col rounded-lg shadow-lg overflow-hidden bg-white ${
        selected ? "ring-2 ring-blue-500" : "ring-1 ring-slate-300"
      }`}
      style={{
        left: canvasOrigin + pos.x,
        top: canvasOrigin + pos.y,
        width: size.w,
        height: size.h,
        zIndex: el.z,
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <header
        className="flex items-center justify-between px-2 h-7 bg-slate-100 border-b border-slate-200 cursor-move select-none shrink-0"
        onMouseDown={beginDrag}
      >
        <span className="text-xs font-medium text-slate-600 truncate">
          {el.name}
        </span>
        {lockedBy && (
          <span className="ml-auto mr-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            {lockPhase ?? "generating"}
          </span>
        )}
        <button
          className="text-slate-400 hover:text-red-500 text-sm leading-none px-1"
          title="Delete"
          onMouseDown={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          ✕
        </button>
      </header>
      <div className="relative flex-1 min-h-0">
        {js && renderMode === "live" ? (
          <ComponentFrame
            root={root}
            elementId={el.id}
            js={js}
            codeVersion={el.codeVersion}
          />
        ) : js ? (
          <PausedFrame
            name={el.name}
            reason={placeholderReason}
            onActivate={onSelect}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-slate-400">
            loading…
          </div>
        )}
        {/* Overlay captures mouse during drag/resize so the iframe doesn't eat events. */}
        {interacting && <div className="absolute inset-0 cursor-grabbing" />}
      </div>
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        onMouseDown={beginResize}
        style={{
          background:
            "linear-gradient(135deg, transparent 50%, rgb(148 163 184) 50%)",
        }}
      />
    </div>
  );
}

function PausedFrame({
  name,
  reason,
  onActivate,
}: {
  name: string;
  reason: "offscreen" | "small";
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-50 px-3 text-center text-xs text-slate-500 hover:bg-slate-100"
      onMouseDown={(e) => {
        e.stopPropagation();
        onActivate();
      }}
    >
      <span className="font-medium text-slate-600">{name}</span>
      <span>
        {reason === "offscreen"
          ? "Paused while offscreen to save memory"
          : "Preview mode at small size"}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-blue-500">
        Click to load app
      </span>
    </button>
  );
}
