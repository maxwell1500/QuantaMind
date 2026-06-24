import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompareColumn } from "../components/CompareColumn";
import type { CompareRow } from "../state/compareStore";

const ROW = (over: Partial<CompareRow> = {}): CompareRow => ({
  model: "llama3.2:1b", modelId: null, status: "pending", output: "",
  metrics: null, error: null, startedAt: null, endedAt: null,
  ...over,
});

describe("CompareColumn", () => {
  it("renders the model name and pending status", () => {
    render(<CompareColumn row={ROW()} />);
    expect(screen.getByText("llama3.2:1b")).toBeInTheDocument();
    expect(screen.getByTestId("compare-status-llama3.2:1b")).toHaveTextContent("Waiting");
  });

  it("renders streaming output and Running status", () => {
    render(<CompareColumn row={ROW({ status: "running", output: "Hello world" })} />);
    expect(screen.getByTestId("compare-status-llama3.2:1b")).toHaveTextContent("Running");
    expect(screen.getByTestId("compare-output-llama3.2:1b")).toHaveTextContent("Hello world");
  });

  it("renders metrics line only when status is done", () => {
    const row = ROW({ status: "done", output: "ok",
      metrics: { ttft_ms: 142, tokens_per_sec: 38.2, token_count: 218 } });
    render(<CompareColumn row={row} />);
    expect(screen.getByTestId("compare-metrics-llama3.2:1b")).toHaveTextContent(
      "TTFT 142ms · 38.2 tok/s · 218 tokens",
    );
  });

  it("renders the error block when status is error", () => {
    render(<CompareColumn row={ROW({ status: "error", error: { kind: "inference", message: "HTTP 500" } })} />);
    expect(screen.getByTestId("compare-error-llama3.2:1b")).toHaveTextContent("inference: HTTP 500");
  });

  it("renders Cancelled status without metrics", () => {
    render(<CompareColumn row={ROW({ status: "cancelled" })} />);
    expect(screen.getByTestId("compare-status-llama3.2:1b")).toHaveTextContent("Cancelled");
    expect(screen.queryByTestId("compare-metrics-llama3.2:1b")).toBeNull();
  });
});
