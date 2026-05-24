import { describe, it, expect, beforeEach } from "vitest";
import { useNavStore } from "../navStore";

beforeEach(() => useNavStore.setState({ topView: "workspace" }));

describe("navStore", () => {
  it("defaults to workspace", () => {
    expect(useNavStore.getState().topView).toBe("workspace");
  });

  it("setTopView round-trips for every allowed view", () => {
    const views = ["workspace", "compare", "models", "downloads", "storage"] as const;
    for (const v of views) {
      useNavStore.getState().setTopView(v);
      expect(useNavStore.getState().topView).toBe(v);
    }
  });
});
