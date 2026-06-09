import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LocalFilePreview } from "../LocalFilePreview";
import type { GgufMetadata } from "../../../../shared/ipc/models/gguf";

const META: GgufMetadata = {
  architecture: "llama",
  parameter_count: 8_030_000_000,
  context_length: 8192,
  quantization: "Q4_K_M",
  family: "Llama",
};

function setup(overrides: Partial<React.ComponentProps<typeof LocalFilePreview>> = {}) {
  const onNameChange = vi.fn();
  const onImport = vi.fn();
  const onCancel = vi.fn();
  const props = {
    path: "/Users/x/Downloads/llama3-8b-q4_k_m.gguf",
    meta: META,
    name: "llama3-8b-q4_k_m",
    onNameChange, onImport, onCancel,
    busy: false,
    percent: 0,
    phaseLabel: null as string | null,
    error: null as string | null,
    conflict: false,
    ...overrides,
  };
  render(<LocalFilePreview {...props} />);
  return { onNameChange, onImport, onCancel };
}

describe("LocalFilePreview (M.8)", () => {
  it("renders filename, family, params, ctx, quant from metadata", () => {
    setup();
    expect(screen.getByText("llama3-8b-q4_k_m.gguf")).toBeInTheDocument();
    const preview = screen.getByTestId("local-preview");
    expect(preview).toHaveTextContent("Llama");
    expect(preview).toHaveTextContent("8.0B params");
    expect(preview).toHaveTextContent("8192 ctx");
    expect(preview).toHaveTextContent("Q4_K_M");
  });

  it("Import disabled when name has illegal chars; valid name enables it", () => {
    const { onImport } = setup({ name: "bad name with spaces" });
    const importBtn = screen.getByRole("button", { name: /^import/i });
    expect(importBtn).toBeDisabled();
    expect(screen.getByTestId("name-invalid")).toBeInTheDocument();
    fireEvent.click(importBtn);
    expect(onImport).not.toHaveBeenCalled();
  });

  it("conflict prop renders replace warning (does not disable Import)", () => {
    setup({ conflict: true });
    expect(screen.getByTestId("name-conflict")).toHaveTextContent(/already exists/);
    expect(screen.getByRole("button", { name: /^import/i })).not.toBeDisabled();
  });

  it("busy disables both buttons and shows Importing… label", () => {
    setup({ busy: true });
    expect(screen.getByRole("button", { name: /importing/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
  });

  it("error prop renders alert with the message", () => {
    setup({ error: "M.12 not implemented" });
    expect(screen.getByTestId("import-error")).toHaveTextContent("M.12 not implemented");
  });

  it("a truncated-GGUF error renders actionable guidance, not just the raw parser text", () => {
    setup({ error: "GGUF truncated: need 8 bytes at offset 8388601, have 7" });
    const alert = screen.getByTestId("import-error");
    expect(alert).toHaveTextContent("This GGUF file is incomplete");
    expect(alert).toHaveTextContent("Re-download the complete .gguf");
    expect(alert).toHaveTextContent("Git LFS");
    // raw detail is still available, just demoted
    expect(alert).toHaveTextContent("offset 8388601");
  });

  it("Cancel and Import invoke their callbacks; name edit reaches onNameChange", () => {
    const { onCancel, onImport, onNameChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /^import/i }));
    expect(onImport).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText("Model name"), { target: { value: "new-name" } });
    expect(onNameChange).toHaveBeenLastCalledWith("new-name");
  });
});
