import { useEffect, useState } from "react";
import { create } from "zustand";

interface ToastState {
  message: string | null;
  show: (m: string, ttlMs?: number) => void;
  clear: () => void;
}

const useToastStore = create<ToastState>((set) => ({
  message: null,
  show: (m, ttlMs = 2500) => {
    set({ message: m });
    setTimeout(() => {
      if (useToastStore.getState().message === m) set({ message: null });
    }, ttlMs);
  },
  clear: () => set({ message: null }),
}));

export function useToast() {
  return useToastStore((s) => s.show);
}

export function ToastHost() {
  const message = useToastStore((s) => s.message);
  const clear = useToastStore((s) => s.clear);
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(!!message), [message]);
  if (!message) return null;
  return (
    <div
      role="status"
      data-testid="toast"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded shadow bg-gray-900 text-white text-sm transition-opacity ${visible ? "opacity-100" : "opacity-0"}`}
      onClick={clear}
    >
      {message}
    </div>
  );
}
