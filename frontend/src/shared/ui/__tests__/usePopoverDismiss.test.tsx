import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useRef, useState } from "react";
import { usePopoverDismiss } from "../usePopoverDismiss";

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, ref, onClose);
  return (
    <div ref={ref}>
      <button type="button" data-testid="toggle" onClick={() => setOpen((v) => !v)}>toggle</button>
    </div>
  );
}

let addSpy: ReturnType<typeof vi.spyOn>;
let removeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  addSpy = vi.spyOn(document, "addEventListener");
  removeSpy = vi.spyOn(document, "removeEventListener");
});
afterEach(() => {
  addSpy.mockRestore();
  removeSpy.mockRestore();
});

const countFor = (spy: typeof addSpy, type: string) =>
  spy.mock.calls.filter((c: unknown[]) => c[0] === type).length;

describe("usePopoverDismiss (leak guard)", () => {
  it("attaches listeners only when open and removes them on close", () => {
    const { getByTestId } = render(<Harness onClose={() => {}} />);
    expect(countFor(addSpy, "mousedown")).toBe(0);
    fireEvent.click(getByTestId("toggle")); // open
    expect(countFor(addSpy, "mousedown")).toBe(1);
    expect(countFor(addSpy, "keydown")).toBe(1);
    fireEvent.click(getByTestId("toggle")); // close
    expect(countFor(removeSpy, "mousedown")).toBe(1);
    expect(countFor(removeSpy, "keydown")).toBe(1);
  });

  it("removes listeners on unmount while open (no dangling listeners)", () => {
    const { getByTestId, unmount } = render(<Harness onClose={() => {}} />);
    fireEvent.click(getByTestId("toggle")); // open
    unmount();
    expect(countFor(removeSpy, "mousedown")).toBe(1);
    expect(countFor(removeSpy, "keydown")).toBe(1);
  });
});
