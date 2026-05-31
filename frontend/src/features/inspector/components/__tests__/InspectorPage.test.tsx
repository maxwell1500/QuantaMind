import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../../../shared/ipc/system/vram", () => ({ loadedModels: vi.fn().mockResolvedValue([]) }));

import { InspectorPage } from "../InspectorPage";
import { useCompareStore } from "../../../compare/state/compareStore";
import type { CompareRow } from "../../../compare/state/compareRow";
import type { TokenTiming } from "../../../../shared/ipc/events/events";

const tl = (n: number): TokenTiming[] =>
  Array.from({ length: n }, (_, i) => ({ text: `t${i}`, t_ms: i * 10, n: i + 1 }));

const doneRow = (model: string, n: number): CompareRow => ({
  model, modelId: null, status: "done", output: "x",
  metrics: { ttft_ms: 10, tokens_per_sec: 50, token_count: n, timeline: tl(n) },
  error: null, startedAt: null, endedAt: null,
});

beforeEach(() => {
  useCompareStore.setState({ rows: [] });
});

describe("InspectorPage", () => {
  it("shows the empty state with no charted rows", () => {
    render(<InspectorPage />);
    expect(screen.getByTestId("inspector-empty")).toBeInTheDocument();
  });

  it("renders one labeled chart for a single run", () => {
    useCompareStore.setState({ rows: [doneRow("llama3.2:1b", 4)] });
    render(<InspectorPage />);
    expect(screen.getByTestId("model-timeline-llama3.2:1b")).toBeInTheDocument();
    expect(screen.getByText("llama3.2:1b")).toBeInTheDocument();
    expect(screen.getAllByTestId("token-timeline")).toHaveLength(1);
  });

  it("renders one chart per model for a multi-model run, each named", () => {
    useCompareStore.setState({ rows: [doneRow("a", 3), doneRow("b", 5)] });
    render(<InspectorPage />);
    expect(screen.getByTestId("model-timeline-a")).toBeInTheDocument();
    expect(screen.getByTestId("model-timeline-b")).toBeInTheDocument();
    expect(screen.getAllByTestId("token-timeline")).toHaveLength(2);
  });

  it("skips rows without a timeline", () => {
    const noTl: CompareRow = { ...doneRow("a", 0), metrics: { ttft_ms: 1, tokens_per_sec: 1, token_count: 0, timeline: [] } };
    useCompareStore.setState({ rows: [noTl] });
    render(<InspectorPage />);
    expect(screen.getByTestId("inspector-empty")).toBeInTheDocument();
  });
});
