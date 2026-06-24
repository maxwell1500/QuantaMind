import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn().mockResolvedValue(undefined) }));

import { ErrorCard } from "../ErrorCard";
import { open } from "@tauri-apps/plugin-shell";

beforeEach(() => vi.clearAllMocks());

describe("ErrorCard", () => {
  it("renders title and body", () => {
    render(<ErrorCard title="Boom" body="It broke" />);
    expect(screen.getByText("Boom")).toBeTruthy();
    expect(screen.getByText("It broke")).toBeTruthy();
  });

  it("fires the primary action", () => {
    const onClick = vi.fn();
    render(<ErrorCard title="t" body="b" action={{ label: "Retry", onClick }} />);
    fireEvent.click(screen.getByTestId("error-action"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("opens the docs link in the system browser", () => {
    render(<ErrorCard title="t" body="b" learnMore="https://quantamind.co/docs/troubleshooting#x" />);
    fireEvent.click(screen.getByTestId("error-learn-more"));
    expect(open).toHaveBeenCalledWith("https://quantamind.co/docs/troubleshooting#x");
  });

  it("omits the action row when neither action nor learnMore is given", () => {
    render(<ErrorCard title="t" body="b" />);
    expect(screen.queryByTestId("error-action")).toBeNull();
    expect(screen.queryByTestId("error-learn-more")).toBeNull();
  });
});
