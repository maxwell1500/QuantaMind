import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { StoragePathSection } from "../StoragePathSection";

const CURRENT = { current_path: "/Users/x/.ollama/models", from_env: false };
const CURRENT_FROM_ENV = { current_path: "/mnt/big/ollama", from_env: true };

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(open).mockReset();
});

describe("StoragePathSection (M.13)", () => {
  it("renders the current path from get_storage_path", async () => {
    vi.mocked(invoke).mockResolvedValue(CURRENT);
    render(<StoragePathSection />);
    await waitFor(() => expect(screen.getByTestId("storage-path-current")).toBeInTheDocument());
    expect(screen.getByTestId("storage-path-current")).toHaveTextContent("/Users/x/.ollama/models");
    expect(screen.queryByText(/\$OLLAMA_MODELS/)).toBeNull();
  });

  it("annotates path source as $OLLAMA_MODELS when from_env=true", async () => {
    vi.mocked(invoke).mockResolvedValue(CURRENT_FROM_ENV);
    render(<StoragePathSection />);
    await waitFor(() => expect(screen.getByText(/\$OLLAMA_MODELS/)).toBeInTheDocument());
  });

  it("Change → directory picker → validation passes → shows manual setup snippet", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) => {
      if (cmd === "get_storage_path") return Promise.resolve(CURRENT);
      if (cmd === "validate_storage_path") {
        const a = args as { path: string };
        expect(a.path).toBe("/mnt/big");
        return Promise.resolve({
          exists: true, is_dir: true, writable: true,
          free_bytes: 200 * 1024 ** 3, total_bytes: 1000 * 1024 ** 3, sufficient: true,
        });
      }
      return Promise.reject(new Error(`unknown ${cmd}`));
    });
    vi.mocked(open).mockResolvedValue("/mnt/big");
    render(<StoragePathSection />);
    await waitFor(() => expect(screen.getByTestId("storage-path-current")).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /change/i }));
    });
    expect(open).toHaveBeenCalledWith({ directory: true, multiple: false });
    await waitFor(() => expect(screen.getByTestId("storage-path-validation")).toBeInTheDocument());
    const block = screen.getByTestId("storage-path-validation");
    expect(block).toHaveTextContent("/mnt/big");
    expect(block).toHaveTextContent("Sufficient space");
    expect(block).toHaveTextContent(/export OLLAMA_MODELS="\/mnt\/big"/);
  });

  it("insufficient space shows warning and skips the setup snippet", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_storage_path") return Promise.resolve(CURRENT);
      if (cmd === "validate_storage_path") return Promise.resolve({
        exists: true, is_dir: true, writable: true,
        free_bytes: 10 * 1024 ** 3, total_bytes: 100 * 1024 ** 3, sufficient: false,
      });
      return Promise.reject(new Error("x"));
    });
    vi.mocked(open).mockResolvedValue("/mnt/small");
    render(<StoragePathSection />);
    await waitFor(() => screen.getByTestId("storage-path-current"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /change/i }));
    });
    await waitFor(() => screen.getByTestId("storage-path-validation"));
    const block = screen.getByTestId("storage-path-validation");
    expect(block).toHaveTextContent(/Less than 50GB/);
    expect(block).not.toHaveTextContent(/export OLLAMA_MODELS/);
  });

  it("Browse cancelled (open returns null) → no validation block appears", async () => {
    vi.mocked(invoke).mockResolvedValue(CURRENT);
    vi.mocked(open).mockResolvedValue(null);
    render(<StoragePathSection />);
    await waitFor(() => screen.getByTestId("storage-path-current"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /change/i }));
    });
    expect(screen.queryByTestId("storage-path-validation")).toBeNull();
  });
});
