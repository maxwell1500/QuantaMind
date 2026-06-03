import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NameDialog } from "../../components/manager/NameDialog";

describe("NameDialog", () => {
  it("disables Create until a non-empty name is entered", () => {
    render(<NameDialog onCreate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId("eval-name-create")).toBeDisabled();
    fireEvent.change(screen.getByTestId("eval-name-input"), { target: { value: "my-suite" } });
    expect(screen.getByTestId("eval-name-create")).not.toBeDisabled();
  });

  it("calls onCreate with the trimmed name", () => {
    const onCreate = vi.fn();
    render(<NameDialog onCreate={onCreate} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("eval-name-input"), { target: { value: "  my-suite  " } });
    fireEvent.click(screen.getByTestId("eval-name-create"));
    expect(onCreate).toHaveBeenCalledWith("my-suite");
  });

  it("closes on Cancel and on Escape", () => {
    const onClose = vi.fn();
    render(<NameDialog onCreate={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("eval-name-cancel"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
