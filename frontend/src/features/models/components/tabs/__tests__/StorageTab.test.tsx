import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { StorageTab } from "../StorageTab";

const PHI = {
  name: "phi3.5:latest", size_bytes: 2_200_000_000, modified_at: "2026-05-22",
  family: "phi", parameter_size: "3.8B", quantization: "Q4_K_M",
};
const QWEN = {
  name: "qwen2.5:7b", size_bytes: 4_400_000_000, modified_at: "2026-05-21",
  family: "qwen", parameter_size: "7B", quantization: "Q4_K_M",
};
const DISK = { total_bytes: 500_000_000_000, free_bytes: 200_000_000_000, ollama_models_bytes: 6_600_000_000 };

function mockInstalled(list: typeof PHI[]) {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_installed_models_with_stats") return Promise.resolve(list);
    if (cmd === "get_disk_usage")
      return Promise.resolve({ ...DISK, ollama_models_bytes: list.reduce((s, m) => s + m.size_bytes, 0) });
    if (cmd === "remove_model") return Promise.resolve();
    return Promise.reject(new Error(`unknown ${cmd}`));
  });
}

beforeEach(() => { vi.mocked(invoke).mockReset(); });

describe("StorageTab (M.5)", () => {
  it("renders disk summary and the installed list", async () => {
    mockInstalled([PHI, QWEN]);
    render(<StorageTab />);
    await waitFor(() => expect(screen.getByTestId("installed-phi3.5:latest")).toBeInTheDocument());
    expect(screen.getByTestId("disk-summary")).toHaveTextContent(/Models:/);
    expect(screen.getByTestId("disk-summary")).toHaveTextContent(/Free:/);
    expect(screen.getByTestId("installed-qwen2.5:7b")).toBeInTheDocument();
  });

  it("shows an actionable empty-state message when the list is empty", async () => {
    mockInstalled([]);
    render(<StorageTab />);
    await waitFor(() =>
      expect(screen.getByTestId("installed-list")).toHaveTextContent(
        /No models installed yet.*Ollama Library.*Hugging Face.*Local File/,
      ),
    );
  });

  it("clicking Uninstall opens the confirm dialog with model name and freed size", async () => {
    mockInstalled([PHI]);
    render(<StorageTab />);
    await waitFor(() => expect(screen.getByTestId("installed-phi3.5:latest")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /uninstall/i }));
    const dialog = screen.getByTestId("confirm-dialog");
    expect(dialog).toHaveTextContent("phi3.5:latest");
    expect(dialog).toHaveTextContent(/2\.0GB/);
  });

  it("confirm Remove invokes remove_model and refreshes the list", async () => {
    mockInstalled([PHI]);
    render(<StorageTab />);
    await waitFor(() => expect(screen.getByTestId("installed-phi3.5:latest")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /uninstall/i }));
    // After confirm, the next refresh returns an empty list
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "remove_model") return Promise.resolve();
      if (cmd === "get_installed_models_with_stats") return Promise.resolve([]);
      if (cmd === "get_disk_usage") return Promise.resolve({ ...DISK, ollama_models_bytes: 0 });
      return Promise.reject(new Error(`unknown ${cmd}`));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    });
    expect(invoke).toHaveBeenCalledWith("remove_model", { name: "phi3.5:latest" });
    await waitFor(() => expect(screen.queryByTestId("installed-phi3.5:latest")).toBeNull());
  });

  it("Cancel closes the dialog without removing", async () => {
    mockInstalled([PHI]);
    render(<StorageTab />);
    await waitFor(() => expect(screen.getByTestId("installed-phi3.5:latest")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /uninstall/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith("remove_model", expect.anything());
    // model still listed
    expect(screen.getByTestId("installed-phi3.5:latest")).toBeInTheDocument();
  });
});
