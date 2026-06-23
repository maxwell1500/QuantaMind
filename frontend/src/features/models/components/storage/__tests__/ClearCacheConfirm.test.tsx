import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClearCacheConfirm } from "../ClearCacheConfirm";

/// Typing CLEAR arms the confirm; the model-cache checkbox decides whether the
/// opt-in HF clear runs. The flag must reach onConfirm verbatim either way so
/// the button stays models-safe unless the box is explicitly checked.
describe("ClearCacheConfirm", () => {
  const arm = () =>
    fireEvent.change(screen.getByTestId("clear-cache-input"), { target: { value: "CLEAR" } });

  it("confirms with includeModels=false when the box is left unchecked", () => {
    const onConfirm = vi.fn();
    render(<ClearCacheConfirm onConfirm={onConfirm} onCancel={vi.fn()} busy={false} error={null} />);
    arm();
    fireEvent.click(screen.getByTestId("clear-cache-confirm-btn"));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it("confirms with includeModels=true after checking the model-cache box", () => {
    const onConfirm = vi.fn();
    render(<ClearCacheConfirm onConfirm={onConfirm} onCancel={vi.fn()} busy={false} error={null} />);
    arm();
    fireEvent.click(screen.getByTestId("clear-cache-models"));
    fireEvent.click(screen.getByTestId("clear-cache-confirm-btn"));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it("keeps the confirm disabled until CLEAR is typed, regardless of the box", () => {
    const onConfirm = vi.fn();
    render(<ClearCacheConfirm onConfirm={onConfirm} onCancel={vi.fn()} busy={false} error={null} />);
    fireEvent.click(screen.getByTestId("clear-cache-models"));
    fireEvent.click(screen.getByTestId("clear-cache-confirm-btn"));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
