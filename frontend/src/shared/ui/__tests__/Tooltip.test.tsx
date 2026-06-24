import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Tooltip } from "../Tooltip";

describe("Tooltip", () => {
  it("is hidden until hover, shows the label on enter, hides on leave", () => {
    render(
      <Tooltip label="Loop Cap 4 · Fake Done 0" testId="x">
        <span>ⓘ</span>
      </Tooltip>,
    );
    expect(screen.queryByTestId("tooltip-x")).toBeNull();

    fireEvent.mouseEnter(screen.getByText("ⓘ").parentElement as HTMLElement);
    expect(screen.getByTestId("tooltip-x")).toHaveTextContent("Loop Cap 4 · Fake Done 0");

    fireEvent.mouseLeave(screen.getByText("ⓘ").parentElement as HTMLElement);
    expect(screen.queryByTestId("tooltip-x")).toBeNull();
  });

  it("also opens on keyboard focus (accessible) and renders into document.body (clip-safe)", () => {
    render(
      <div style={{ overflow: "hidden" }}>
        <Tooltip label="Reachable even inside overflow:hidden">
          <span>trigger</span>
        </Tooltip>
      </div>,
    );
    fireEvent.focus(screen.getByText("trigger").parentElement as HTMLElement);
    const tip = screen.getByTestId("tooltip");
    expect(tip).toHaveTextContent("Reachable even inside overflow:hidden");
    // Portalled to <body>, so an overflow:hidden ancestor can't clip it.
    expect(tip.closest("[style*='overflow']")).toBeNull();
  });
});
