import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../../../shared/ipc/models/mlx_start", () => ({
  startMlxServer: vi.fn(),
  stopMlxServer: vi.fn(),
  mlxServerStatus: vi.fn(),
}));
vi.mock("../../../../shared/ipc/core/client", () => ({ checkMlxHealth: vi.fn() }));

import { startMlxServer } from "../../../../shared/ipc/models/mlx_start";
import { MlxServerControl } from "../status/MlxServerControl";
import { useBackendStore } from "../../../../shared/state/backendStore";
import { useSelectedModelStore } from "../../../../shared/state/selectedModelStore";

beforeEach(() => {
  vi.clearAllMocks();
  useBackendStore.setState({ mlxHealthy: null });
  useSelectedModelStore.setState({ selectedModels: [] });
});

describe("MlxServerControl", () => {
  it("disables Start with no model selected (no repo input)", () => {
    render(<MlxServerControl />);
    expect(screen.getByTestId("mlx-start")).toBeDisabled();
    expect(screen.queryByTestId("mlx-repo-input")).toBeNull();
    expect(screen.queryByTestId("mlx-stop")).toBeNull();
  });

  it("starts the selected MLX model by its local path", async () => {
    vi.mocked(startMlxServer).mockResolvedValue({ status: "started", pid: 1, port: 8083 });
    useSelectedModelStore.setState({
      selectedModels: [{ name: "/m/mlx-community_X-4bit", backend: "mlx", size_bytes: 0, path: "/m/mlx-community_X-4bit" }],
    });
    render(<MlxServerControl />);
    const start = screen.getByTestId("mlx-start");
    expect(start).toBeEnabled();
    fireEvent.click(start);
    await waitFor(() => expect(startMlxServer).toHaveBeenCalledWith("/m/mlx-community_X-4bit"));
  });

  it("shows Stop when MLX is healthy", () => {
    useBackendStore.setState({ mlxHealthy: true });
    render(<MlxServerControl />);
    expect(screen.getByTestId("mlx-stop")).toHaveTextContent("Stop MLX");
    expect(screen.queryByTestId("mlx-start")).toBeNull();
  });
});
