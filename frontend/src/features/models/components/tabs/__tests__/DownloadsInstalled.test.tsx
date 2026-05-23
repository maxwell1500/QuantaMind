import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("../../../../../shared/ipc/storage", () => ({
  getInstalledModelsWithStats: vi.fn(),
  removeModel: vi.fn(),
}));

import {
  getInstalledModelsWithStats,
  removeModel,
} from "../../../../../shared/ipc/storage";
import { DownloadsInstalled } from "../DownloadsInstalled";

const FIXTURE = [
  { name: "phi3.5:latest", family: "phi", parameter_size: "3.8B",
    quantization: "Q4_K_M", size_bytes: 2_400_000_000, modified_at: "2026-05-22" },
];

beforeEach(() => {
  vi.mocked(getInstalledModelsWithStats).mockReset();
  vi.mocked(removeModel).mockReset();
});

describe("DownloadsInstalled", () => {
  it("shows helpful empty state when nothing is installed", async () => {
    vi.mocked(getInstalledModelsWithStats).mockResolvedValue([]);
    render(<DownloadsInstalled />);
    expect(await screen.findByTestId("downloads-empty-installed")).toHaveTextContent(
      /Ollama Library.*Hugging Face.*Local File/,
    );
  });

  it("renders installed model with metadata and a Delete button", async () => {
    vi.mocked(getInstalledModelsWithStats).mockResolvedValue(FIXTURE);
    render(<DownloadsInstalled />);
    expect(await screen.findByTestId("download-installed-phi3.5:latest")).toHaveTextContent(/3\.8B/);
    expect(screen.getByRole("button", { name: /delete phi3.5:latest/i })).toBeInTheDocument();
  });

  it("Delete opens confirm with freed size; clicking Remove invokes removeModel and refreshes", async () => {
    vi.mocked(getInstalledModelsWithStats).mockResolvedValue(FIXTURE);
    vi.mocked(removeModel).mockResolvedValue(undefined);
    render(<DownloadsInstalled />);
    fireEvent.click(await screen.findByRole("button", { name: /delete phi3.5:latest/i }));
    const dialog = screen.getByTestId("downloads-confirm-delete");
    expect(dialog).toHaveTextContent("phi3.5:latest");
    expect(dialog).toHaveTextContent(/2\.2GB|2\.4GB/);
    vi.mocked(getInstalledModelsWithStats).mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() => expect(removeModel).toHaveBeenCalledWith("phi3.5:latest"));
  });
});
