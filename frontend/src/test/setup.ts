import "@testing-library/jest-dom/vitest";

// jsdom lacks ResizeObserver; the Inspector's chart-sizing hook needs it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
