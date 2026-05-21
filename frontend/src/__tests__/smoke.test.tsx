import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { create } from "zustand";
import { z } from "zod";

describe("phase 1.2 — deps wired up", () => {
  it("tailwind class lands on the rendered element", () => {
    const { getByTestId } = render(
      <div data-testid="t" className="bg-red-500" />,
    );
    expect(getByTestId("t").className).toBe("bg-red-500");
  });

  it("zustand get/set round-trips", () => {
    const useStore = create<{ n: number; set: (v: number) => void }>((set) => ({
      n: 0,
      set: (v) => set({ n: v }),
    }));
    expect(useStore.getState().n).toBe(0);
    useStore.getState().set(42);
    expect(useStore.getState().n).toBe(42);
  });

  it("zod validates a schema", () => {
    const schema = z.object({ name: z.string().min(1) });
    expect(schema.parse({ name: "splice" }).name).toBe("splice");
    expect(() => schema.parse({ name: "" })).toThrow();
  });

  it("monaco wrapper exports Editor + useMonaco + loader", async () => {
    const mod = await import("@monaco-editor/react");
    expect(mod.Editor).toBeTruthy();
    expect(typeof mod.useMonaco).toBe("function");
    expect(typeof mod.loader).toBe("object");
    expect((mod.Editor as { $$typeof?: symbol }).$$typeof).toBeTypeOf("symbol");
  });
});
