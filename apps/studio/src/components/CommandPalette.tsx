import { Command, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type PaletteAction = {
  id: string;
  group: string;
  label: string;
  shortcut?: string;
  run: () => void;
};

type Props = {
  open: boolean;
  actions: PaletteAction[];
  onClose: () => void;
};

export function CommandPalette({ open, actions, onClose }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const filtered = actions.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      item.label.toLowerCase().includes(q) ||
      item.group.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="command-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="command-dialog"
        role="dialog"
        aria-label="Paleta de comandos"
      >
        <div className="command-head">
          <Search size={14} />
          <input
            ref={input}
            type="text"
            value={query}
            placeholder="Ejecutar comando, cambiar vista, añadir operador, disparar cue…"
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(filtered.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter" && filtered[index]) {
                e.preventDefault();
                filtered[index].run();
                onClose();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <span className="command-kbd">
            <Command size={11} /> Esc
          </span>
        </div>

        <div className="command-list">
          {filtered.length > 0 ? (
            filtered.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={i === index ? "is-active" : ""}
                onMouseEnter={() => setIndex(i)}
                onClick={() => {
                  item.run();
                  onClose();
                }}
              >
                <span className="command-group">{item.group}</span>
                <span className="command-label">{item.label}</span>
                {item.shortcut && (
                  <kbd className="command-shortcut">{item.shortcut}</kbd>
                )}
              </button>
            ))
          ) : (
            <p className="palette-empty">Sin comandos coincidentes.</p>
          )}
        </div>
      </div>
    </div>
  );
}
