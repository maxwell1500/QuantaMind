import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TierProgressionMatrix } from "../components/TierProgressionMatrix";
import type { Tier, TierStat } from "../../../shared/ipc/eval/readiness";

const ft = () => ({
  infinite_loop_hits: 0,
  hallucinated_completions: 0,
  malformed_json_calls: 0,
  schema_unrecovered_calls: 0,
  unknown_tool_calls: 0,
  forbidden_calls: 0,
  turn_timeouts: 0,
});
const stat = (tier: Tier, passed: number, total: number, avg: number | null): TierStat => ({
  tier,
  tasks_passed: passed,
  tasks_total: total,
  avg_steps: avg,
  failures: ft(),
});

describe("TierProgressionMatrix", () => {
  it("derives CLEAR / SATURATED / FAIL / NOT-TESTED and renders measured metrics or '—'", () => {
    render(
      <TierProgressionMatrix
        byTier={[
          stat("easy", 1, 1, 4.1), // 100% ≥ 0.8 → CLEAR
          stat("medium", 1, 2, null), // 50% < 0.8 but > 0 → SATURATED; null steps → "—"
          stat("hard", 0, 1, 28.0), // 0% → FAIL
          // extreme absent → NOT TESTED
        ]}
        minPassK={0.8}
        params={{ easy: { horizon: "3–8 steps", decoys: "0" } }}
        selectedTier={null}
        onSelectTier={() => {}}
      />,
    );

    expect(screen.getByTestId("tier-result-easy")).toHaveTextContent("CLEAR");
    expect(screen.getByTestId("tier-result-medium")).toHaveTextContent("SATURATED");
    expect(screen.getByTestId("tier-result-hard")).toHaveTextContent("FAIL");
    expect(screen.getByTestId("tier-result-extreme")).toHaveTextContent("NOT TESTED");

    // Measured Pass^k rate (real), null metric → "—", never fabricated.
    expect(screen.getByTestId("tier-passk-easy")).toHaveTextContent("100.0%");
    expect(screen.getByTestId("tier-passk-extreme")).toHaveTextContent("—");
    expect(screen.getByTestId("tier-steps-medium")).toHaveTextContent("—");
    expect(screen.getByTestId("tier-steps-hard")).toHaveTextContent("28.0");

    // Pass^k target reflects the tier policy (Easy=5, Extreme=24).
    expect(screen.getByTestId("tier-passk-easy")).toHaveTextContent("Pass^5 Rate");
    expect(screen.getByTestId("tier-passk-extreme")).toHaveTextContent("Pass^24 Rate");

    // Task Parameters: real axes where provided, "not declared" otherwise (never faked).
    expect(screen.getByTestId("tier-horizon-easy")).toHaveTextContent("3–8 steps");
    expect(screen.getByTestId("tier-horizon-hard")).toHaveTextContent("not declared");
  });

  it("clicking a TESTED tier selects it; a NOT-TESTED tier is inert; re-click clears", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <TierProgressionMatrix
        byTier={[stat("hard", 0, 1, 28.0)]} // hard tested; others not tested
        minPassK={0.8}
        selectedTier={null}
        onSelectTier={onSelect}
      />,
    );
    // A tested tier selects on click.
    fireEvent.click(screen.getByTestId("tier-card-hard"));
    expect(onSelect).toHaveBeenCalledWith("hard");
    // A not-tested tier is inert (no callback).
    fireEvent.click(screen.getByTestId("tier-card-easy"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    // When already selected, clicking it again clears (null).
    rerender(
      <TierProgressionMatrix
        byTier={[stat("hard", 0, 1, 28.0)]}
        minPassK={0.8}
        selectedTier="hard"
        onSelectTier={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId("tier-card-hard"));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
