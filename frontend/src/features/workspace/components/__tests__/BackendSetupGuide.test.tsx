import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));
vi.mock("../../hooks/useMlxBackend", () => ({ useMlxBackend: vi.fn() }));

import { useMlxBackend } from "../../hooks/useMlxBackend";
import { BackendSetupGuide } from "../BackendSetupGuide";

const setAppleSilicon = (appleSilicon: boolean) =>
  vi.mocked(useMlxBackend).mockReturnValue({ appleSilicon } as ReturnType<typeof useMlxBackend>);

beforeEach(() => vi.mocked(useMlxBackend).mockReset());

describe("BackendSetupGuide", () => {
  it("shows the mlx-audio STT card with its install command on Apple Silicon", () => {
    setAppleSilicon(true);
    render(<BackendSetupGuide />);
    const card = screen.getByTestId("setup-engine-mlx-audio");
    expect(card).toHaveTextContent('pip install "mlx-audio[server]"');
    expect(card).toHaveTextContent("mlx-community/whisper-*");
    // whisper.cpp (not Apple-only) is always present.
    expect(screen.getByTestId("setup-engine-whisper")).toBeInTheDocument();
  });

  it("excludes the Apple-only cards (mlx-audio, MLX) off Apple Silicon", () => {
    setAppleSilicon(false);
    render(<BackendSetupGuide />);
    expect(screen.queryByTestId("setup-engine-mlx-audio")).toBeNull();
    expect(screen.queryByTestId("setup-engine-mlx")).toBeNull();
    expect(screen.getByTestId("setup-engine-whisper")).toBeInTheDocument();
    expect(screen.getByTestId("setup-engine-ollama")).toBeInTheDocument();
  });
});
