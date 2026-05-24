import { describe, it, expect, beforeEach } from "vitest";
import { findActiveDownload, useModelStore } from "../modelStore";

beforeEach(() => {
  useModelStore.setState({ activeTab: "ollama", downloads: {} });
});

describe("modelStore (M.3)", () => {
  it("starts with activeTab=ollama and an empty downloads map", () => {
    const s = useModelStore.getState();
    expect(s.activeTab).toBe("ollama");
    expect(s.downloads).toEqual({});
  });

  it("setActiveTab transitions through all valid values", () => {
    const { setActiveTab } = useModelStore.getState();
    setActiveTab("huggingface");
    expect(useModelStore.getState().activeTab).toBe("huggingface");
    setActiveTab("local");
    expect(useModelStore.getState().activeTab).toBe("local");
    setActiveTab("ollama");
    expect(useModelStore.getState().activeTab).toBe("ollama");
  });

  it("findActiveDownload returns the first downloading/installing entry", () => {
    const { upsertDownload } = useModelStore.getState();
    upsertDownload({ id: "a", source: "ollama", name: "a", status: "success", percent: 100 });
    expect(findActiveDownload(useModelStore.getState().downloads)).toBeUndefined();
    upsertDownload({ id: "b", source: "ollama", name: "b", status: "downloading", percent: 30 });
    const active = findActiveDownload(useModelStore.getState().downloads);
    expect(active?.name).toBe("b");
    expect(active?.percent).toBe(30);
  });

  it("findActiveDownload returns undefined for an empty map", () => {
    expect(findActiveDownload({})).toBeUndefined();
  });

  it("hfSearchQuery defaults to empty and round-trips via setHfSearchQuery", () => {
    expect(useModelStore.getState().hfSearchQuery).toBe("");
    useModelStore.getState().setHfSearchQuery("llama");
    expect(useModelStore.getState().hfSearchQuery).toBe("llama");
  });

  it("hfSelectedRepo defaults to null and round-trips via setHfSelectedRepo", () => {
    expect(useModelStore.getState().hfSelectedRepo).toBeNull();
    useModelStore.getState().setHfSelectedRepo("bartowski/Test-GGUF");
    expect(useModelStore.getState().hfSelectedRepo).toBe("bartowski/Test-GGUF");
    useModelStore.getState().setHfSelectedRepo(null);
    expect(useModelStore.getState().hfSelectedRepo).toBeNull();
  });
});
