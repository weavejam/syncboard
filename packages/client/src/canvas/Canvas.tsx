import type { BoardApi } from "../fluid/useBoard.js";
import { BoardElement } from "./BoardElement.js";

interface Props {
  board: BoardApi;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function Canvas({ board, selectedId, onSelect }: Props) {
  const { root, elements } = board;

  return (
    <div
      className="relative flex-1 h-full overflow-hidden bg-slate-50"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgb(203 213 225) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
      onMouseDown={() => onSelect("")}
    >
      {root &&
        elements.map((el) => (
          <BoardElement
            key={el.id}
            el={el}
            root={root}
            js={root.code.get(el.id)?.js ?? ""}
            selected={selectedId === el.id}
            onSelect={() => onSelect(el.id)}
            onUpdate={(patch) => board.updateElement(el.id, patch)}
            onDelete={() => board.deleteElement(el.id)}
            onBringToFront={() => board.bringToFront(el.id)}
          />
        ))}

      {elements.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm pointer-events-none">
          Ask the chat on the right to generate a component →
        </div>
      )}
    </div>
  );
}
