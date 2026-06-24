import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/// A clip-safe hover tooltip. The bubble is portalled to <body> and positioned
/// with `position: fixed` from the trigger's rect, so an `overflow: hidden/auto`
/// ancestor (e.g. the scrollable Performance Matrix card) can NEVER clip it — the
/// reason the native `title=` attribute was used before, which the macOS WebView
/// renders unreliably. `label` is plain text; the trigger is whatever you wrap.
export function Tooltip({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    setPos(r ? { top: r.bottom + 6, left: r.left + r.width / 2 } : { top: 0, left: 0 });
  };
  const hide = () => setPos(null);

  return (
    <span
      ref={ref}
      className="inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
    >
      {children}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            data-testid={testId ? `tooltip-${testId}` : "tooltip"}
            style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translateX(-50%)", zIndex: 60, maxWidth: 300 }}
            className="pointer-events-none rounded-lg border border-white/15 bg-slate-800 px-3 py-2 text-[11px] leading-relaxed text-slate-200 shadow-xl"
          >
            {label}
          </div>,
          document.body,
        )}
    </span>
  );
}
