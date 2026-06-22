import { useEffect, useRef, useState } from "react";
import type { BoardApi, ElementSnapshot } from "../fluid/useBoard.js";
import { BoardElement } from "./BoardElement.js";

interface Props {
  board: BoardApi;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

interface Viewport {
  left: number;
  top: number;
  width: number;
  height: number;
  now: number;
}

const WORLD_SIZE = 200_000;
const WORLD_ORIGIN = WORLD_SIZE / 2;
const PRELOAD_MARGIN = 800;
const UNLOAD_AFTER_MS = 15_000;
const SMALL_PREVIEW_WIDTH = 220;
const SMALL_PREVIEW_HEIGHT = 170;
const MINIMAP_WIDTH = 220;
const MINIMAP_HEIGHT = 140;
const MINIMAP_PAD = 10;

const initialViewport: Viewport = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  now: Date.now(),
};

function intersectsViewport(
  el: ElementSnapshot,
  viewport: Viewport,
  margin: number,
): boolean {
  const left = viewport.left - margin;
  const top = viewport.top - margin;
  const right = viewport.left + viewport.width + margin;
  const bottom = viewport.top + viewport.height + margin;
  return (
    el.x + el.width >= left &&
    el.x <= right &&
    el.y + el.height >= top &&
    el.y <= bottom
  );
}

function minimapBounds(elements: ElementSnapshot[], viewport: Viewport) {
  const lefts = [viewport.left, ...elements.map((el) => el.x)];
  const tops = [viewport.top, ...elements.map((el) => el.y)];
  const rights = [
    viewport.left + viewport.width,
    ...elements.map((el) => el.x + el.width),
  ];
  const bottoms = [
    viewport.top + viewport.height,
    ...elements.map((el) => el.y + el.height),
  ];
  const minX = Math.min(...lefts) - 400;
  const minY = Math.min(...tops) - 400;
  const maxX = Math.max(...rights) + 400;
  const maxY = Math.max(...bottoms) + 400;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function Canvas({ board, selectedId, onSelect }: Props) {
  const { root, elements } = board;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const panCleanupRef = useRef<(() => void) | null>(null);
  const [viewport, setViewport] = useState<Viewport>(initialViewport);
  const [offscreenSince, setOffscreenSince] = useState<Record<string, number>>(
    {},
  );
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const updateViewport = () => {
      setViewport({
        left: scroller.scrollLeft - WORLD_ORIGIN,
        top: scroller.scrollTop - WORLD_ORIGIN,
        width: scroller.clientWidth,
        height: scroller.clientHeight,
        now: Date.now(),
      });
    };

    // Center the initial view around logical board coordinate (0, 0), so
    // existing elements at small x/y values remain visible.
    scroller.scrollLeft = WORLD_ORIGIN;
    scroller.scrollTop = WORLD_ORIGIN;
    updateViewport();

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateViewport);
    };
    const onResize = () => updateViewport();
    const tick = window.setInterval(updateViewport, 1000);

    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(tick);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    setOffscreenSince((current) => {
      let changed = false;
      const next = { ...current };

      for (const id of Object.keys(next)) {
        if (!elements.some((el) => el.id === id)) {
          delete next[id];
          changed = true;
        }
      }

      for (const el of elements) {
        const selected = selectedId === el.id;
        const nearViewport = intersectsViewport(el, viewport, PRELOAD_MARGIN);
        if (nearViewport || selected) {
          if (next[el.id] !== undefined) {
            delete next[el.id];
            changed = true;
          }
        } else if (next[el.id] === undefined) {
          next[el.id] = viewport.now;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [elements, selectedId, viewport]);

  useEffect(() => {
    return () => {
      panCleanupRef.current?.();
      panCleanupRef.current = null;
    };
  }, []);

  const beginPan = (e: React.MouseEvent) => {
    if (e.button !== 2) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;

    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = scroller.scrollLeft;
    const startTop = scroller.scrollTop;
    setIsPanning(true);

    const onMove = (ev: MouseEvent) => {
      scroller.scrollLeft = startLeft - (ev.clientX - startX);
      scroller.scrollTop = startTop - (ev.clientY - startY);
    };
    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", cleanup);
      setIsPanning(false);
      panCleanupRef.current = null;
    };

    panCleanupRef.current?.();
    panCleanupRef.current = cleanup;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", cleanup);
  };

  const jumpTo = (x: number, y: number) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollLeft = WORLD_ORIGIN + x - scroller.clientWidth / 2;
    scroller.scrollTop = WORLD_ORIGIN + y - scroller.clientHeight / 2;
  };

  return (
    <div className="relative flex-1 h-full overflow-hidden bg-slate-50">
      <div
        ref={scrollerRef}
        className={`hide-scrollbar absolute inset-0 overflow-auto ${
          isPanning ? "cursor-grabbing" : "cursor-default"
        }`}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => {
          beginPan(e);
          if (e.target === e.currentTarget && e.button !== 2) onSelect("");
        }}
      >
        <div
          className="relative"
          style={{
            width: WORLD_SIZE,
            height: WORLD_SIZE,
            backgroundImage:
              "radial-gradient(circle, rgb(203 213 225) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={(e) => {
            beginPan(e);
            if (e.target === e.currentTarget && e.button !== 2) onSelect("");
          }}
        >
          {root &&
            elements.map((el) => {
              const selected = selectedId === el.id;
              const lock = board.lockFor(el.id);
              const nearViewport = intersectsViewport(
                el,
                viewport,
                PRELOAD_MARGIN,
              );
              const elementOffscreenSince = offscreenSince[el.id];

              const timedOutOffscreen =
                !nearViewport &&
                elementOffscreenSince !== undefined &&
                viewport.now - elementOffscreenSince > UNLOAD_AFTER_MS;
              const tooSmall =
                el.width < SMALL_PREVIEW_WIDTH ||
                el.height < SMALL_PREVIEW_HEIGHT;
              const renderMode =
                selected || (!timedOutOffscreen && !tooSmall)
                  ? "live"
                  : "placeholder";
              const placeholderReason = timedOutOffscreen ? "offscreen" : "small";

              return (
                <BoardElement
                  key={el.id}
                  el={el}
                  root={root}
                  js={root.code.get(el.id)?.js ?? ""}
                  selected={selected}
                  canvasOrigin={WORLD_ORIGIN}
                  renderMode={renderMode}
                  placeholderReason={placeholderReason}
                  lockedBy={lock?.ownerClientId}
                  lockPhase={lock?.phase}
                  onSelect={() => onSelect(el.id)}
                  onUpdate={(patch) => board.updateElement(el.id, patch)}
                  onDelete={() => board.deleteElement(el.id)}
                  onBringToFront={() => board.bringToFront(el.id)}
                />
              );
            })}

          {elements.length === 0 && (
            <div
              className="absolute flex items-center justify-center text-slate-400 text-sm pointer-events-none"
              style={{
                left: WORLD_ORIGIN,
                top: WORLD_ORIGIN,
                width: viewport.width,
                height: viewport.height,
              }}
            >
              Ask the chat on the right to generate a component →
            </div>
          )}
        </div>
      </div>
      <Minimap elements={elements} viewport={viewport} onJump={jumpTo} />
    </div>
  );
}

function Minimap({
  elements,
  viewport,
  onJump,
}: {
  elements: ElementSnapshot[];
  viewport: Viewport;
  onJump: (x: number, y: number) => void;
}) {
  const bounds = minimapBounds(elements, viewport);
  const scale = Math.min(
    (MINIMAP_WIDTH - MINIMAP_PAD * 2) / bounds.width,
    (MINIMAP_HEIGHT - MINIMAP_PAD * 2) / bounds.height,
  );
  const mapX = (x: number) => MINIMAP_PAD + (x - bounds.minX) * scale;
  const mapY = (y: number) => MINIMAP_PAD + (y - bounds.minY) * scale;
  const viewportX = mapX(viewport.left);
  const viewportY = mapY(viewport.top);
  const viewportW = Math.max(8, viewport.width * scale);
  const viewportH = Math.max(8, viewport.height * scale);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = bounds.minX + (e.clientX - rect.left - MINIMAP_PAD) / scale;
    const y = bounds.minY + (e.clientY - rect.top - MINIMAP_PAD) / scale;
    onJump(x, y);
  };

  return (
    <div className="absolute bottom-3 left-3 rounded-lg border border-slate-200 bg-white/90 p-2 shadow-lg backdrop-blur">
      <svg
        width={MINIMAP_WIDTH}
        height={MINIMAP_HEIGHT}
        viewBox={`0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`}
        className="block cursor-crosshair"
        onPointerDown={onPointerDown}
      >
        <rect
          x="0"
          y="0"
          width={MINIMAP_WIDTH}
          height={MINIMAP_HEIGHT}
          rx="8"
          fill="#f8fafc"
        />
        {elements.map((el) => (
          <rect
            key={el.id}
            x={mapX(el.x)}
            y={mapY(el.y)}
            width={Math.max(3, el.width * scale)}
            height={Math.max(3, el.height * scale)}
            rx="2"
            fill="#3b82f6"
            opacity="0.65"
          />
        ))}
        <rect
          x={viewportX}
          y={viewportY}
          width={viewportW}
          height={viewportH}
          rx="3"
          fill="none"
          stroke="#0f172a"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}
