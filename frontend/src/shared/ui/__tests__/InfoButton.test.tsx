import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InfoButton } from "../InfoButton";

describe("InfoButton", () => {
  it("opens a titled popup on hover and closes when the cursor leaves", () => {
    render(
      <span data-testid="wrap">
        <InfoButton title="Pass^k" body="passes / total runs" testId="passK" />
      </span>,
    );
    expect(screen.queryByTestId("info-popup-passK")).toBeNull();

    // The hover target is the wrapper span around the icon + popup.
    const wrapper = screen.getByTestId("info-passK").parentElement as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    const popup = screen.getByTestId("info-popup-passK");
    expect(popup).toHaveTextContent("Pass^k");
    expect(popup).toHaveTextContent("passes / total runs");

    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByTestId("info-popup-passK")).toBeNull();
  });

  it("does not use a help (?) cursor on the icon", () => {
    render(<InfoButton title="T" body="B" testId="t" />);
    expect(screen.getByTestId("info-t").className).not.toContain("cursor-help");
  });
});
