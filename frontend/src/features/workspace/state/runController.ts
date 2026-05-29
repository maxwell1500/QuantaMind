import { create } from "zustand";

// The header Play/Stop reads this; whichever run surface is mounted (SingleRun
// or MultiRun) registers its handlers + state here. See useRegisterRun.
interface RunController {
  running: boolean;
  canRun: boolean;
  run: () => void;
  stop: () => void;
  register: (h: { running: boolean; canRun: boolean; run: () => void; stop: () => void }) => void;
  clear: () => void;
}

const NOOP = () => {};

export const useRunController = create<RunController>((set) => ({
  running: false,
  canRun: false,
  run: NOOP,
  stop: NOOP,
  register: (h) => set(h),
  clear: () => set({ running: false, canRun: false, run: NOOP, stop: NOOP }),
}));
