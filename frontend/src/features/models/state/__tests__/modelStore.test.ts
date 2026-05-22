import { describe, it, expect, beforeEach } from "vitest";
import { useModelStore } from "../modelStore";

beforeEach(() => {
  useModelStore.setState({ activeTab: "ollama", installInFlight: null });
});

describe("modelStore (M.3)", () => {
  it("starts with activeTab=ollama and no install in flight", () => {
    const s = useModelStore.getState();
    expect(s.activeTab).toBe("ollama");
    expect(s.installInFlight).toBeNull();
  });

  it("setActiveTab transitions through all three valid values", () => {
    const { setActiveTab } = useModelStore.getState();
    setActiveTab("huggingface");
    expect(useModelStore.getState().activeTab).toBe("huggingface");
    setActiveTab("local");
    expect(useModelStore.getState().activeTab).toBe("local");
    setActiveTab("ollama");
    expect(useModelStore.getState().activeTab).toBe("ollama");
  });

  it("setInstallInFlight stores then clears", () => {
    const { setInstallInFlight } = useModelStore.getState();
    setInstallInFlight({ source: "ollama", name: "phi3.5:latest", progress: 0 });
    expect(useModelStore.getState().installInFlight?.name).toBe("phi3.5:latest");
    setInstallInFlight(null);
    expect(useModelStore.getState().installInFlight).toBeNull();
  });
});
