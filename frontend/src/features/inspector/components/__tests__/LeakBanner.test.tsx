import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeakBanner } from "../LeakBanner";
import { useLeakStore } from "../../state/leakStore";
import type { LeakSample } from "../../format/leak";

const GB = 1024 ** 3;
const s = (rssGb: number, model = "m"): LeakSample => ({ model, rssBytes: rssGb * GB });

beforeEach(() => useLeakStore.setState({ series: [] }));

describe("LeakBanner", () => {
  it("renders nothing with fewer than 5 samples", () => {
    useLeakStore.setState({ series: [s(1), s(2)] });
    const { container } = render(<LeakBanner />);
    expect(container.querySelector('[data-testid="leak-banner"]')).toBeNull();
  });

  it("warns on a same-model monotonic climb", () => {
    useLeakStore.setState({ series: [s(1.9), s(2.1), s(2.5), s(2.9), s(3.4)] });
    render(<LeakBanner />);
    expect(screen.getByTestId("leak-banner")).toHaveTextContent(/Possible memory leak/);
  });

  it("shows stable when the series is flat", () => {
    useLeakStore.setState({ series: [s(2), s(2), s(2), s(2), s(2)] });
    render(<LeakBanner />);
    expect(screen.getByTestId("leak-banner")).toHaveTextContent(/stable/);
  });
});
