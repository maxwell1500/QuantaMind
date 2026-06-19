import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FailureTaxonomy } from "../components/FailureTaxonomy";
import type { Tier, TierStat } from "../../../shared/ipc/eval/readiness";
import type { FailureTracker } from "../../../shared/ipc/eval/batch";

const stat = (tier: Tier, failures: Partial<FailureTracker>): TierStat => ({
  tier,
  tasks_passed: 0,
  tasks_total: 1,
  avg_steps: null,
  failures: {
    infinite_loop_hits: 0,
    hallucinated_completions: 0,
    malformed_json_calls: 0,
    schema_unrecovered_calls: 0,
    unknown_tool_calls: 0,
    forbidden_calls: 0,
    turn_timeouts: 0,
    ...failures,
  },
});

describe("FailureTaxonomy", () => {
  it("sums across the tested tiers, sorts modes desc, shows share-of-events %", () => {
    render(
      <FailureTaxonomy
        byTier={[
          stat("hard", { unknown_tool_calls: 30, forbidden_calls: 20, infinite_loop_hits: 10 }),
          stat("extreme", { unknown_tool_calls: 15, forbidden_calls: 10, hallucinated_completions: 10, infinite_loop_hits: 5 }),
        ]}
      />,
    );
    // Heading names the tiers that actually ran (NOT a hardcoded Hard+Extreme rule).
    expect(screen.getByTestId("failure-taxonomy")).toHaveTextContent("across Hard + Extreme");
    // Totals: UnknownTool 45, ForbiddenCall 30, InfiniteLoop 15, Hallucinated 10 → /100.
    expect(screen.getByTestId("failure-row-unknown_tool_calls")).toHaveTextContent("45%");
    expect(screen.getByTestId("failure-row-forbidden_calls")).toHaveTextContent("30%");
    expect(screen.getByTestId("failure-row-infinite_loop_hits")).toHaveTextContent("15%");
    expect(screen.getByTestId("failure-row-hallucinated_completions")).toHaveTextContent("10%");
    // Honest denominator wording — failure events, not failed runs.
    expect(screen.getByTestId("failure-taxonomy")).toHaveTextContent("tracked failure events");
    // A zero mode is omitted entirely.
    expect(screen.queryByTestId("failure-row-turn_timeouts")).toBeNull();
  });

  it("a clean run (no failures) shows the empty state, not fabricated rows", () => {
    render(<FailureTaxonomy byTier={[stat("medium", {})]} />);
    expect(screen.getByTestId("failure-taxonomy-empty")).toBeInTheDocument();
    // Mainstream Easy/Medium runs still get a real (here empty) section — heading names them.
    expect(screen.getByTestId("failure-taxonomy")).toHaveTextContent("across Medium");
  });
});
