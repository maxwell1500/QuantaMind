import { useState, type ReactNode } from "react";

/// A small ⓘ help affordance. Hovering the icon opens a self-contained popup
/// explaining a tool or metric; the popup lives inside the wrapper so moving onto
/// it keeps it open, and leaving the wrapper closes it. Styled as a dark overlay
/// so it reads on both the dark Eval/Audit panels and the light Quant/Inspector
/// pages.
export function InfoButton({
  title,
  body,
  align = "right",
  testId,
}: {
  title: string;
  body: ReactNode;
  /// Which edge of the icon the popup hangs from. "right" (default) opens it to
  /// the left so a top-right button stays on screen.
  align?: "left" | "right";
  testId?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`About ${title}`}
        aria-expanded={open}
        data-testid={testId ? `info-${testId}` : "info-button"}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] leading-none text-gray-400 hover:text-gray-200"
      >
        i
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={title}
          data-testid={testId ? `info-popup-${testId}` : "info-popup"}
          className={`absolute top-5 z-30 w-72 rounded-lg border border-white/15 bg-slate-800 p-3 shadow-xl ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="text-xs font-semibold text-slate-100">{title}</div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-300">{body}</div>
        </div>
      )}
    </span>
  );
}
