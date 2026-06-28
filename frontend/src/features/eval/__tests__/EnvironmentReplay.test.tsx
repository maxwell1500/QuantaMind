import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { FileTreeReplay } from "../components/replay/FileTreeReplay";
import { CorpusReplay } from "../components/replay/CorpusReplay";
import { WebUiReplay } from "../components/replay/WebUiReplay";
import { EnvironmentReplayPanel, hasEnvReplay } from "../components/replay/EnvironmentReplayPanel";
import type { EnvView, TrajectoryStep } from "../../../shared/ipc/eval/batch";

const webUiView = (over: Partial<Extract<EnvView, { kind: "web_ui" }>> = {}): Extract<EnvView, { kind: "web_ui" }> => ({
  kind: "web_ui",
  state: { route: "/cart", fields: { coupon: "SAVE10" }, toggles: { gift: true }, submitted: true },
  action: "submit",
  focus: "coupon",
  ...over,
});

const corpusView = (over: Partial<Extract<EnvView, { kind: "web_corpus" }>> = {}): Extract<EnvView, { kind: "web_corpus" }> => ({
  kind: "web_corpus",
  index: [
    { doc_id: "d_photo", title: "Photosynthesis" },
    { doc_id: "d_resp", title: "Cellular Respiration" },
  ],
  query: "photosynthesis",
  results: [{ doc_id: "d_photo", title: "Photosynthesis", snippet: "Plants release oxygen" }],
  focus_doc: null,
  content: null,
  op: "search",
  ...over,
});

const fsView = (over: Partial<Extract<EnvView, { kind: "file_system" }>> = {}): Extract<EnvView, { kind: "file_system" }> => ({
  kind: "file_system",
  tree: [
    { path: "config.yaml", is_dir: false },
    { path: "src", is_dir: true },
    { path: "src/app.py", is_dir: false },
  ],
  focus_path: "config.yaml",
  op: "read",
  content: "timeout: 30\nretries: 2\n",
  matches: [],
  ...over,
});

const step = (i: number, env: EnvView): TrajectoryStep => ({
  run_index: 0,
  step_index: i,
  raw_output: "",
  injection: null,
  kind: "tool_call",
  env,
});

describe("FileTreeReplay", () => {
  it("renders the tree, highlights the focused path, and shows real file content", () => {
    render(<FileTreeReplay view={fsView()} />);
    expect(screen.getByTestId("fs-replay")).toBeInTheDocument();
    // The touched file is highlighted (focused).
    expect(screen.getByTestId("fs-node-config.yaml")).toHaveAttribute("data-focused", "true");
    expect(screen.getByTestId("fs-node-src/app.py")).not.toHaveAttribute("data-focused");
    // The REAL content is shown (the acks-empty fix made visible), not an ack.
    expect(screen.getByTestId("fs-content")).toHaveTextContent("timeout: 30");
  });

  it("shows matches for a list/search op", () => {
    render(<FileTreeReplay view={fsView({ op: "search", focus_path: "connect_db", content: null, matches: ["db/conn.py:1: def connect_db():"] })} />);
    expect(screen.getByTestId("fs-matches")).toHaveTextContent("db/conn.py:1: def connect_db():");
  });
});

describe("CorpusReplay", () => {
  it("renders the corpus index + ranked search results with snippets", () => {
    render(<CorpusReplay view={corpusView()} />);
    expect(screen.getByTestId("corpus-replay")).toBeInTheDocument();
    expect(screen.getByTestId("corpus-doc-d_photo")).toHaveTextContent("Photosynthesis");
    expect(screen.getByTestId("corpus-results")).toHaveTextContent("Plants release oxygen");
  });

  it("highlights the fetched doc and shows its real full content", () => {
    render(
      <CorpusReplay
        view={corpusView({ op: "fetch", query: null, results: [], focus_doc: "d_photo", content: "It converts light energy into glucose." })}
      />,
    );
    expect(screen.getByTestId("corpus-doc-d_photo")).toHaveAttribute("data-focused", "true");
    expect(screen.getByTestId("corpus-content")).toHaveTextContent("converts light energy into glucose");
  });
});

describe("WebUiReplay", () => {
  it("renders the route, field values, toggle state, and a submitted badge", () => {
    render(<WebUiReplay view={webUiView()} />);
    expect(screen.getByTestId("webui-replay")).toBeInTheDocument();
    expect(screen.getByTestId("webui-route")).toHaveTextContent("/cart");
    expect(screen.getByTestId("webui-field-coupon")).toHaveTextContent("SAVE10");
    // The touched control is highlighted.
    expect(screen.getByTestId("webui-field-coupon")).toHaveAttribute("data-focused", "true");
    expect(screen.getByTestId("webui-toggle-gift")).toHaveAttribute("data-on", "true");
    expect(screen.getByTestId("webui-submit")).toHaveAttribute("data-submitted", "true");
  });

  it("shows the un-submitted state", () => {
    render(<WebUiReplay view={webUiView({ state: { route: "/cart", fields: { coupon: "" }, submitted: false }, action: "fill", focus: "coupon" })} />);
    expect(screen.getByTestId("webui-submit")).toHaveAttribute("data-submitted", "false");
  });
});

describe("EnvironmentReplayPanel", () => {
  it("hasEnvReplay is true only when a step carries a non-none env", () => {
    expect(hasEnvReplay([step(0, fsView())])).toBe(true);
    expect(hasEnvReplay([step(0, { kind: "none" })])).toBe(false);
    expect(hasEnvReplay([{ ...step(0, { kind: "none" }), env: undefined }])).toBe(false);
  });

  it("defaults to the latest action turn and scrubs to other turns", () => {
    const steps = [
      step(0, fsView({ op: "list", focus_path: "src", content: null, matches: ["src/app.py"] })),
      step(1, fsView()), // read config.yaml — the latest action
      step(2, { kind: "none" }), // terminal no-op
    ];
    render(<EnvironmentReplayPanel steps={steps} />);
    // Default view = the latest real action (turn 2 = read config.yaml), not the terminal turn.
    expect(screen.getByTestId("step-scrubber-label")).toHaveTextContent("turn 2/3");
    expect(screen.getByTestId("fs-content")).toHaveTextContent("timeout: 30");
    // Scrub back to turn 1 (the list) → matches shown.
    fireEvent.change(screen.getByLabelText("turn scrubber"), { target: { value: "0" } });
    expect(screen.getByTestId("fs-matches")).toHaveTextContent("src/app.py");
  });
});
