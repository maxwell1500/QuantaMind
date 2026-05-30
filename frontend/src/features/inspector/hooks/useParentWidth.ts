import { useEffect, useRef, useState } from "react";

/// Track a container's width via ResizeObserver so an SVG chart can fill it.
/// Returns [ref, width]; width is 0 until first measured (callers fall back).
export function useParentWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
