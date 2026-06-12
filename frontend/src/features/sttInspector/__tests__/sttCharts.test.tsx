import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfidenceTimeline } from "../components/ConfidenceTimeline";
import { ConfidenceHistogram } from "../components/ConfidenceHistogram";
import { SttPhaseBar } from "../components/SttPhaseBar";
import { buildConfidenceTimeline } from "../format/confidenceTimeline";
import { buildConfidenceHistogram } from "../format/confidenceHistogram";
import type { Segment } from "../../../shared/ipc/stt/transcribe";

const seg = (p: Partial<Segment>): Segment => ({
  text: "word",
  start_secs: 0,
  end_secs: 1,
  avg_logprob: -0.2,
  no_speech_prob: 0.01,
  words: null,
  ...p,
});

describe("ConfidenceTimeline", () => {
  const chart = buildConfidenceTimeline(
    [
      seg({ start_secs: 0, end_secs: 2, avg_logprob: -0.1, text: "clear" }),
      seg({ start_secs: 2, end_secs: 4, avg_logprob: -1.5, text: "muffled" }), // low
      seg({ start_secs: 4, end_secs: 6, avg_logprob: null, text: "no logprob" }), // gap
    ],
    6,
  );

  it("draws a bar per measured segment and skips the null-confidence gap", () => {
    render(<ConfidenceTimeline chart={chart} width={400} height={120} />);
    expect(screen.getByTestId("conf-bar-ok-0")).toBeInTheDocument();
    expect(screen.getByTestId("conf-bar-low-1")).toBeInTheDocument();
    expect(screen.queryByTestId("conf-bar-ok-2")).toBeNull(); // null logprob = no bar
  });

  it("hovering a bar reveals its confidence and text", () => {
    render(<ConfidenceTimeline chart={chart} width={400} height={120} />);
    fireEvent.mouseEnter(screen.getByTestId("conf-hit-1"));
    const readout = screen.getByTestId("confidence-readout").textContent ?? "";
    expect(readout).toContain("#1");
    expect(readout).toContain("low confidence");
    expect(readout).toContain("muffled");
  });
});

describe("ConfidenceHistogram", () => {
  it("renders a flagged bin in rose", () => {
    const chart = buildConfidenceTimeline(
      [seg({ avg_logprob: -1.5 }), seg({ avg_logprob: -0.1 }), seg({ avg_logprob: -0.1 })],
      3,
    );
    render(<ConfidenceHistogram buckets={buildConfidenceHistogram(chart.bars)} width={400} height={100} />);
    expect(screen.getByTestId("confidence-histogram")).toBeInTheDocument();
    expect(screen.getAllByTestId("conf-hist-bar-flagged").length).toBeGreaterThan(0);
  });

  it("renders nothing for fewer than 2 measured points", () => {
    const { container } = render(<ConfidenceHistogram buckets={[]} width={400} height={100} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("SttPhaseBar", () => {
  it("splits wall time into first-segment and transcription", () => {
    render(<SttPhaseBar firstSegmentMs={500} wallMs={5000} width={640} />);
    expect(screen.getByTestId("stt-phase-seg-firstSeg")).toBeInTheDocument();
    expect(screen.getByTestId("stt-phase-seg-rest")).toBeInTheDocument();
  });

  it("shows an N/A note when wall time is missing", () => {
    render(<SttPhaseBar firstSegmentMs={500} wallMs={null} />);
    expect(screen.getByTestId("stt-phase-na")).toBeInTheDocument();
  });
});
