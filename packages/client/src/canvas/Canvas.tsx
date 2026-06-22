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

export function Canvas({ board, selectedId, onSelect }: Props) {
  const { root, elements } = board;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>(initialViewport);
  const [offscreenSince, setOffscreenSince] = useState<Record<string, number>>(
    {},
  );

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

  return (
    <div
      ref={scrollerRef}
      className="relative flex-1 h-full overflow-auto bg-slate-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onSelect("");
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
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onSelect("");
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
              el.width < SMALL_PREVIEW_WIDTH || el.height < SMALL_PREVIEW_HEIGHT;
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
  );
}
