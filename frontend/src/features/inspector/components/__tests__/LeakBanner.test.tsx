import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeakBanner } from "../LeakBanner";
import { useLeakStore } from "../../state/leakStore";

const GB = 1024 ** 3;

beforeEach(() => useLeakStore.setState({ series: [] }));

describe("LeakBanner", () => {
  it("renders nothing with fewer than 5 samples", () => {
    useLeakStore.setState({ series: [GB, 2 * GB] });
    const { container } = render(<LeakBanner />);
    expect(container.querySelector('[data-testid="leak-banner"]')).toBeNull();
  });

  it("warns on a monotonic climb", () => {
    useLeakStore.setState({ series: [1.9 * GB, 2.1 * GB, 2.5 * GB, 2.9 * GB, 3.4 * GB] });
    render(<LeakBanner />);
    expect(screen.getByTestId("leak-banner")).toHaveTextContent(/Possible memory leak/);
  });

  it("shows stable when the series is flat", () => {
    useLeakStore.setState({ series: [2 * GB, 2 * GB, 2 * GB, 2 * GB, 2 * GB] });
    render(<LeakBanner />);
    expect(screen.getByTestId("leak-banner")).toHaveTextContent(/stable/);
  });
});
