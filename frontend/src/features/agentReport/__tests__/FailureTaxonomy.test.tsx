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
  it("renders nothing until a tier is selected (failures are tier-gated)", () => {
    const { container } = render(<FailureTaxonomy tier={null} />);
    expect(screen.queryByTestId("failure-taxonomy")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows ONLY the selected tier's failures, sorted desc, as share-of-events %", () => {
    render(
      <FailureTaxonomy
        tier={stat("hard", { unknown_tool_calls: 30, forbidden_calls: 20, infinite_loop_hits: 10 })}
      />,
    );
    // Heading names the single selected tier (not a cross-tier sum).
    expect(screen.getByTestId("failure-taxonomy")).toHaveTextContent("— Hard");
    // Just this tier's 60 events: UnknownTool 30/60=50%, ForbiddenCall 20/60=33%, InfiniteLoop 10/60=17%.
    expect(screen.getByTestId("failure-row-unknown_tool_calls")).toHaveTextContent("50%");
    expect(screen.getByTestId("failure-row-forbidden_calls")).toHaveTextContent("33%");
    expect(screen.getByTestId("failure-row-infinite_loop_hits")).toHaveTextContent("17%");
    expect(screen.getByTestId("failure-taxonomy")).toHaveTextContent("tracked failure events");
    // A zero mode is omitted entirely.
    expect(screen.queryByTestId("failure-row-turn_timeouts")).toBeNull();
  });

  it("a selected tier with no failures shows the empty state for that tier", () => {
    render(<FailureTaxonomy tier={stat("medium", {})} />);
    expect(screen.getByTestId("failure-taxonomy-empty")).toBeInTheDocument();
    expect(screen.getByTestId("failure-taxonomy")).toHaveTextContent("— Medium");
  });
});
