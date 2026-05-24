import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { StoragePage } from "../StoragePage";

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_storage_path")
      return Promise.resolve({ current_path: "/tmp", from_env: false });
    if (cmd === "get_disk_usage")
      return Promise.resolve({ total_bytes: 1, free_bytes: 1, ollama_models_bytes: 0 });
    if (cmd === "get_installed_models_with_stats") return Promise.resolve([]);
    return Promise.reject(new Error(`unknown ${cmd}`));
  });
});

describe("StoragePage", () => {
  it("renders the Storage heading and embeds the StorageTab body", () => {
    render(<StoragePage />);
    expect(screen.getByRole("heading", { name: /Storage/ })).toBeInTheDocument();
    expect(screen.getByTestId("page-storage")).toBeInTheDocument();
    expect(screen.getByTestId("storage-tab")).toBeInTheDocument();
  });
});
