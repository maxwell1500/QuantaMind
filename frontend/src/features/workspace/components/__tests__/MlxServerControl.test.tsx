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
  useWorkspaceStore.setState({ mlxHealthy: null, mlxRepo: null });
});

describe("MlxServerControl", () => {
  it("offers a repo field + Start when MLX isn't running", () => {
    render(<MlxServerControl />);
    expect((screen.getByTestId("mlx-repo-input") as HTMLInputElement).value).toContain("mlx-community/");
    expect(screen.getByTestId("mlx-start")).toHaveTextContent("Start MLX");
    expect(screen.queryByTestId("mlx-stop")).toBeNull();
  });

  it("prefills the repo picked from HuggingFace search", () => {
    useWorkspaceStore.setState({ mlxRepo: "mlx-community/Qwen2.5-3B-Instruct-4bit" });
    render(<MlxServerControl />);
    expect((screen.getByTestId("mlx-repo-input") as HTMLInputElement).value).toBe(
      "mlx-community/Qwen2.5-3B-Instruct-4bit",
    );
  });

  it("when healthy, keeps the repo field and offers Switch + Stop", () => {
    useWorkspaceStore.setState({ mlxHealthy: true });
    render(<MlxServerControl />);
    expect(screen.getByTestId("mlx-stop")).toHaveTextContent("Stop MLX");
    // The field + action stay so a different repo can be loaded without first
    // stopping (start_mlx_server swaps the running model).
    expect(screen.getByTestId("mlx-repo-input")).toBeInTheDocument();
    expect(screen.getByTestId("mlx-start")).toHaveTextContent("Switch model");
  });
});
