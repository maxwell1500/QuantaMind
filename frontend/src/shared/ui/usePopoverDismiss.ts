import { useEffect, useRef, type RefObject } from "react";

/// Close a popover on an outside click or Escape. One listener pair, attached
/// only while open and always removed on close/unmount — the single cleanup path
/// shared by the header popovers (no per-component document listeners to leak).
/// `onClose` is read through a ref so the effect re-subscribes only when `open`
/// flips, not on every render.
export function usePopoverDismiss(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) cb.current(); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") cb.current(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open, ref]);
}
