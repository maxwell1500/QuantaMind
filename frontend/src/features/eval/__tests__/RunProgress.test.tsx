import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RunProgress } from "../components/scoreboard/RunProgress";
import type { LiveActivity } from "../state/batchStore";

const live = (over: Partial<LiveActivity> = {}): LiveActivity => ({
  taskId: "a1",
  category: "agentic",
  runIndex: 2,
  stepIndex: 4,
  stepKind: "tool_call",
  startedAt: Date.now(),
  native: false,
  ...over,
});

describe("RunProgress (live run line)", () => {
  it("renders task, run, turn, action and an elapsed clock so the run reads as working", () => {
    render(<RunProgress done={1} total={3} live={live()} k={16} maxSteps={10} />);
    const line = screen.getByTestId("scoreboard-progress-detail").textContent ?? "";
    // 0-based indices surface as human 1-based counts against their denominators.
    expect(line).toContain("Task a1");
    expect(line).toContain("1/3 tasks");
    expect(line).toContain("Run 3/16");
    expect(line).toContain("Step 5/10");
    expect(line).toContain("calling tools");
    expect(line).toContain("elapsed");
  });

  it("a loop-cap turn reads honestly (not 'working') so a stalled run isn't disguised", () => {
    render(<RunProgress done={0} total={1} live={live({ stepKind: "infinite_loop" })} k={2} maxSteps={10} />);
    expect(screen.getByTestId("scoreboard-progress-detail").textContent).toContain("loop cap hit");
  });

  it("names the native (tool-calling) pass so a slow native run isn't a silent mystery", () => {
    render(<RunProgress done={0} total={1} live={live({ native: true })} k={1} maxSteps={10} />);
    const line = screen.getByTestId("scoreboard-progress-detail").textContent ?? "";
    expect(line).toContain("Native (Ollama tools) pass");
  });

  it("shows an ETA from the average per-task time once a task has completed", () => {
    // 60s elapsed, 1 of 3 tasks done → ~120s (2m) left for the remaining 2.
    render(<RunProgress done={1} total={3} live={live({ startedAt: Date.now() - 60_000 })} k={1} maxSteps={10} />);
    const line = screen.getByTestId("scoreboard-progress-detail").textContent ?? "";
    expect(line).toContain("left");
    expect(line).toMatch(/~\d+m/);
  });

  it("before the first turn lands, shows the task without phantom run/step counters", () => {
    render(<RunProgress done={0} total={2} live={live({ runIndex: null, stepIndex: null, stepKind: null })} k={5} maxSteps={10} />);
    const line = screen.getByTestId("scoreboard-progress-detail").textContent ?? "";
    expect(line).toContain("Task a1");
    expect(line).not.toContain("Run ");
    expect(line).not.toContain("Step ");
  });
});
