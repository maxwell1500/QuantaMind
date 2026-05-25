import { useState } from "react";
import { refreshAll } from "../state/refreshAll";

export function RefreshButton() {
  const [spinning, setSpinning] = useState(false);
  const onClick = async () => {
    if (spinning) return;
    setSpinning(true);
    try {
      await refreshAll();
    } finally {
      setSpinning(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={spinning}
      aria-label="Refresh Ollama state"
      title="Refresh health + installed models"
      data-testid="refresh-button"
      className="border rounded p-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
        className={spinning ? "animate-spin" : ""}>
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    </button>
  );
}
