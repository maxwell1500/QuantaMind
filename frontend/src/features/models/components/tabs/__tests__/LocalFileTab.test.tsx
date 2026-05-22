import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { LocalFileTab } from "../LocalFileTab";
import { useModelStore } from "../../../state/modelStore";

const VALID_META = { architecture: "llama", parameter_count: 8_000_000_000, context_length: 8192, quantization: "Q4_K_M", family: "Llama" };

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(open).mockReset();
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "list_models") return Promise.resolve([]);
    if (cmd === "inspect_gguf") return Promise.resolve(VALID_META);
    if (cmd === "install_local_gguf") return Promise.reject(new Error("M.12 not yet implemented"));
    return Promise.resolve();
  });
  useModelStore.setState({
    activeTab: "local", installInFlight: null, pendingLocalPath: null,
  });
});

describe("LocalFileTab (M.8)", () => {
  it("shows drop zone + Browse button initially", async () => {
    render(<LocalFileTab />);
    expect(screen.getByTestId("tab-local")).toHaveTextContent(/Drag a \.gguf/);
    expect(screen.getByRole("button", { name: /browse/i })).toBeInTheDocument();
  });

  it("Browse → open(.gguf filter) → inspect_gguf → preview card renders", async () => {
    vi.mocked(open).mockResolvedValue("/tmp/llama3-8b-q4_k_m.gguf");
    render(<LocalFileTab />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /browse/i }));
    });
    await waitFor(() => expect(screen.getByTestId("local-preview")).toBeInTheDocument());
    expect(open).toHaveBeenCalledWith({
      multiple: false,
      filters: [{ name: "GGUF", extensions: ["gguf"] }],
    });
    expect(invoke).toHaveBeenCalledWith("inspect_gguf", { path: "/tmp/llama3-8b-q4_k_m.gguf" });
    expect(screen.getByText("llama3-8b-q4_k_m.gguf")).toBeInTheDocument();
  });

  it("Browse cancelled (open returns null) → stays on drop zone", async () => {
    vi.mocked(open).mockResolvedValue(null);
    render(<LocalFileTab />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /browse/i }));
    });
    expect(screen.getByTestId("tab-local")).toBeInTheDocument();
    expect(screen.queryByTestId("local-preview")).toBeNull();
  });

  it("Cancel from preview returns to drop zone", async () => {
    vi.mocked(open).mockResolvedValue("/tmp/m.gguf");
    render(<LocalFileTab />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /browse/i }));
    });
    await waitFor(() => screen.getByTestId("local-preview"));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByTestId("local-preview")).toBeNull();
    expect(screen.getByTestId("tab-local")).toBeInTheDocument();
  });

  it("Import surfaces the M.12-not-implemented error and stays on preview", async () => {
    vi.mocked(open).mockResolvedValue("/tmp/m.gguf");
    render(<LocalFileTab />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /browse/i }));
    });
    await waitFor(() => screen.getByTestId("local-preview"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^import$/i }));
    });
    expect(invoke).toHaveBeenCalledWith("install_local_gguf", expect.objectContaining({ path: "/tmp/m.gguf" }));
    expect(screen.getByTestId("import-error")).toHaveTextContent(/M\.12 not yet implemented/);
    expect(screen.getByTestId("local-preview")).toBeInTheDocument();
  });

  it("pendingLocalPath from store triggers inspect on mount (drag-drop pathway)", async () => {
    useModelStore.setState({ pendingLocalPath: "/tmp/dropped.gguf" });
    render(<LocalFileTab />);
    await waitFor(() => expect(screen.getByTestId("local-preview")).toBeInTheDocument());
    expect(invoke).toHaveBeenCalledWith("inspect_gguf", { path: "/tmp/dropped.gguf" });
    expect(useModelStore.getState().pendingLocalPath).toBeNull();
  });
});
