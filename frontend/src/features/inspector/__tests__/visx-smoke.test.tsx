import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import { scaleLinear } from "@visx/scale";

// Gate: visx v4 (@next) renders under React 19 with no console error/warning.
describe("visx v4 smoke", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  afterEach(() => { spy.mockClear(); warn.mockClear(); });

  it("renders a scaled Bar inside an SVG", () => {
    const y = scaleLinear({ domain: [0, 10], range: [50, 0] });
    const { container } = render(
      <svg width={100} height={50}>
        <Group>
          <Bar x={0} y={y(8)} width={10} height={50 - y(8)} fill="#2563eb" data-testid="smoke-bar" />
        </Group>
      </svg>,
    );
    expect(container.querySelector('[data-testid="smoke-bar"]')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
