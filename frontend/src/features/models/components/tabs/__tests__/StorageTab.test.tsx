import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { StorageTab } from "../StorageTab";

const DISK = { total_bytes: 500_000_000_000, free_bytes: 200_000_000_000, ollama_models_bytes: 6_600_000_000 };

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_disk_usage") return Promise.resolve(DISK);
    if (cmd === "get_storage_path")
      return Promise.resolve({ current_path: "/tmp", from_env: false });
    if (cmd === "get_installed_models_with_stats") return Promise.resolve([]);
    return Promise.reject(new Error(`unknown ${cmd}`));
  });
});

describe("StorageTab", () => {
  it("renders disk summary", async () => {
    render(<StorageTab />);
    await waitFor(() => {
      const s = screen.getByTestId("disk-summary");
      expect(s).toHaveTextContent(/Models:/);
      expect(s).toHaveTextContent(/Free:/);
    });
  });

  it("does not render an installed-models list (managed on Downloads)", async () => {
    render(<StorageTab />);
    await waitFor(() => expect(screen.getByTestId("disk-summary")).toBeInTheDocument());
    expect(screen.queryByTestId("installed-list")).toBeNull();
    expect(screen.queryByRole("button", { name: /uninstall/i })).toBeNull();
    expect(screen.getByText(/Manage installed models from the Downloads page/i)).toBeInTheDocument();
  });
});
