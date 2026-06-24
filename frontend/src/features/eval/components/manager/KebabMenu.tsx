import { useEffect, useRef, useState } from "react";

export interface KebabItem {
  label: string;
  danger?: boolean;
  onClick: () => void;
  testid?: string;
}

/// A "⋯" overflow button that opens a small menu of actions (e.g. Delete). Closes
/// on outside-click. Used on collection rows and task rows.
export function KebabMenu({ items, testid }: { items: KebabItem[]; testid?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        data-testid={testid}
        title="More actions"
        style={kebabBtn}
      >
        ⋯
      </button>
      {open && (
        <div style={popover} role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                it.onClick();
              }}
              data-testid={it.testid}
              style={{ ...itemBtn, color: it.danger ? "#f87171" : "#cbd5e1" }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const kebabBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#64748b",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
  padding: "0 6px",
};
const popover: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: "100%",
  marginTop: 2,
  minWidth: 120,
  background: "#0f1320",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
  zIndex: 30,
  padding: 4,
  display: "flex",
  flexDirection: "column",
};
const itemBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  textAlign: "left",
  fontSize: 12,
  fontFamily: "Inter, sans-serif",
  padding: "6px 10px",
  borderRadius: 6,
  cursor: "pointer",
};
