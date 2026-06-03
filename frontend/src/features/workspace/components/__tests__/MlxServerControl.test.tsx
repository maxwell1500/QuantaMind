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
import { useWorkspaceStore } from "../../state/workspaceStore";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useCompareStore } from "../../../compare/state/compareStore";

const mlxModel = {
  name: "/m/mlx-community_X-4bit",
  size_bytes: 0,
  modified_at: "",
  family: "MLX",
  parameter_size: "",
  quantization: "4bit",
  backend: "mlx" as const,
  display_name: "mlx-community/X-4bit",
  path: "/m/mlx-community_X-4bit",
};

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ mlxHealthy: null });
  useInstalledModelsStore.setState({ list: [], status: "ready", error: null });
  useCompareStore.getState().reset();
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
    useInstalledModelsStore.setState({ list: [mlxModel], status: "ready", error: null });
    useCompareStore.getState().setSelectedModels([{ name: mlxModel.name, size_bytes: 0 }]);
    render(<MlxServerControl />);
    const start = screen.getByTestId("mlx-start");
    expect(start).toBeEnabled();
    fireEvent.click(start);
    await waitFor(() => expect(startMlxServer).toHaveBeenCalledWith("/m/mlx-community_X-4bit"));
  });

  it("shows Stop when MLX is healthy", () => {
    useWorkspaceStore.setState({ mlxHealthy: true });
    render(<MlxServerControl />);
    expect(screen.getByTestId("mlx-stop")).toHaveTextContent("Stop MLX");
    expect(screen.queryByTestId("mlx-start")).toBeNull();
  });
});
