import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../shared/ipc/models/storage", () => ({
  getInstalledModelsWithStats: vi.fn(),
}));

import { getInstalledModelsWithStats } from "../../../../shared/ipc/models/storage";
import { useInstalledModelsStore } from "../installedModelsStore";

const fake = (name: string) => ({
  name,
  size_bytes: 0,
  modified_at: "2025-01-01T00:00:00Z",
  family: "x",
  parameter_size: "1B",
  quantization: "Q4",
  backend: "ollama" as const,
});

beforeEach(() => {
  vi.mocked(getInstalledModelsWithStats).mockReset();
  useInstalledModelsStore.setState({
    list: [],
    status: "idle",
    error: null,
    lastRefreshedAt: null,
  });
});

describe("installedModelsStore", () => {
  it("refresh() populates list and flips status to ready", async () => {
    vi.mocked(getInstalledModelsWithStats).mockResolvedValue([fake("a"), fake("b")]);
    await useInstalledModelsStore.getState().refresh();
    const s = useInstalledModelsStore.getState();
    expect(s.status).toBe("ready");
    expect(s.list.map((m) => m.name)).toEqual(["a", "b"]);
    expect(s.error).toBeNull();
    expect(s.lastRefreshedAt).not.toBeNull();
  });

  it("refresh() records a friendly error on rejection", async () => {
    vi.mocked(getInstalledModelsWithStats).mockRejectedValue(new Error("boom"));
    await useInstalledModelsStore.getState().refresh();
    const s = useInstalledModelsStore.getState();
    expect(s.status).toBe("error");
    expect(s.error).toContain("boom");
  });

  it("concurrent refreshes coalesce — IPC called once for two parallel refresh() calls", async () => {
    let resolveIt: (v: ReturnType<typeof fake>[]) => void = () => {};
    vi.mocked(getInstalledModelsWithStats).mockReturnValue(
      new Promise((resolve) => { resolveIt = resolve; }),
    );
    const p1 = useInstalledModelsStore.getState().refresh();
    const p2 = useInstalledModelsStore.getState().refresh();
    resolveIt([fake("only")]);
    await Promise.all([p1, p2]);
    expect(getInstalledModelsWithStats).toHaveBeenCalledTimes(1);
    expect(useInstalledModelsStore.getState().list.map((m) => m.name)).toEqual(["only"]);
  });
});
