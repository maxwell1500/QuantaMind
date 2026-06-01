import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../../../shared/ipc/models/mlx_start", () => ({
  startMlxServer: vi.fn(),
  stopMlxServer: vi.fn(),
  mlxServerStatus: vi.fn(),
}));
vi.mock("../../../../shared/ipc/core/client", () => ({ checkMlxHealth: vi.fn() }));

import { MlxServerControl } from "../status/MlxServerControl";
import { useWorkspaceStore } from "../../state/workspaceStore";

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ mlxHealthy: null });
});

describe("MlxServerControl", () => {
  it("offers a repo field + Start when MLX isn't running", () => {
    render(<MlxServerControl />);
    expect((screen.getByTestId("mlx-repo-input") as HTMLInputElement).value).toContain("mlx-community/");
    expect(screen.getByTestId("mlx-start")).toHaveTextContent("Start MLX");
    expect(screen.queryByTestId("mlx-stop")).toBeNull();
  });

  it("shows Stop when MLX is healthy", () => {
    useWorkspaceStore.setState({ mlxHealthy: true });
    render(<MlxServerControl />);
    expect(screen.getByTestId("mlx-stop")).toHaveTextContent("Stop MLX");
    expect(screen.queryByTestId("mlx-start")).toBeNull();
  });
});
