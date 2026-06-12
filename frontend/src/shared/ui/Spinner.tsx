/// A small spinning indicator — shown while a long-running job is in flight so the
/// UI never feels stuck. Size + color are overridable.
export function Spinner({ size = 14, color = "#2563eb", title = "Working…" }: { size?: number; color?: string; title?: string }) {
  return (
    <svg
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label={title}
      data-testid="spinner"
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
