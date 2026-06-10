import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../../shared/ipc/publish/preview", () => ({ previewPublishPayload: vi.fn() }));

import { previewPublishPayload, type PublishPreview } from "../../../shared/ipc/publish/preview";
import { PublishDialog } from "../PublishDialog";
import type { ModelVerdict } from "../../../shared/ipc/eval/readiness";

const VERDICTS: ModelVerdict[] = [
  { model: "qwen", backend: "ollama", verdict: { status: "ready", blocking: [], conditions: [], path: "native_fc" }, pass_k: 0.9 },
];

const preview = (over: Partial<PublishPreview> = {}): PublishPreview => ({
  rows: [{ model: "qwen", quant: "Q4_K_M", cohort_key: "apple-silicon/m3-pro/32-64gb", tool_version: "0.2.0", metrics: { pass_k: 0.9, effort: 1.2, avg_steps: 3 } }],
  canonical_json: '[{"cohort_key":"apple-silicon/m3-pro/32-64gb","metrics":{"avg_steps":3.0,"effort":1.2,"pass_k":0.9},"model":"qwen","quant":"Q4_K_M","tool_version":"0.2.0"}]',
  hash: "abc123",
  cohort_key: "apple-silicon/m3-pro/32-64gb",
  excluded_count: 0,
  invalid: null,
  ...over,
});

const noop = () => {};

beforeEach(() => vi.clearAllMocks());

describe("PublishDialog", () => {
  it("shows the raw payload with no excluded fields, and strikes through what's never shared", async () => {
    vi.mocked(previewPublishPayload).mockResolvedValue(preview());
    render(<PublishDialog verdicts={VERDICTS} onClose={noop} onPublish={noop} />);
    const raw = await screen.findByTestId("publish-raw-payload");
    expect(raw.textContent).toContain('"model":"qwen"');
    expect(raw.textContent).not.toContain("prompt");
    expect(raw.textContent).not.toContain("blocking");
    expect(screen.getAllByTestId("publish-excluded").length).toBeGreaterThan(0);
  });

  it("defaults to opt-out: Publish disabled until the checkbox is checked", async () => {
    vi.mocked(previewPublishPayload).mockResolvedValue(preview());
    render(<PublishDialog verdicts={VERDICTS} onClose={noop} onPublish={noop} />);
    const confirm = await screen.findByTestId("publish-confirm");
    expect(confirm).toBeDisabled();
    expect((screen.getByTestId("publish-optin") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByTestId("publish-optin"));
    expect(confirm).toBeEnabled();
  });

  it("calls onPublish with the preview only after opt-in", async () => {
    const onPublish = vi.fn();
    vi.mocked(previewPublishPayload).mockResolvedValue(preview());
    render(<PublishDialog verdicts={VERDICTS} onClose={noop} onPublish={onPublish} />);
    fireEvent.click(await screen.findByTestId("publish-optin"));
    fireEvent.click(screen.getByTestId("publish-confirm"));
    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(onPublish.mock.calls[0][0].hash).toBe("abc123");
  });

  it("disables Publish on a disallowed write-up link, re-enables when cleared", async () => {
    vi.mocked(previewPublishPayload).mockResolvedValue(preview());
    render(<PublishDialog verdicts={VERDICTS} onClose={noop} onPublish={noop} />);
    fireEvent.click(await screen.findByTestId("publish-optin"));
    const confirm = screen.getByTestId("publish-confirm");
    expect(confirm).toBeEnabled();
    fireEvent.change(screen.getByTestId("publish-link"), { target: { value: "https://evil.com/x" } });
    expect(confirm).toBeDisabled();
    expect(screen.getByTestId("publish-link-hint")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("publish-link"), { target: { value: "https://github.com/me/repo" } });
    expect(confirm).toBeEnabled();
  });

  it("passes the allow-listed link to onPublish", async () => {
    const onPublish = vi.fn();
    vi.mocked(previewPublishPayload).mockResolvedValue(preview());
    render(<PublishDialog verdicts={VERDICTS} onClose={noop} onPublish={onPublish} />);
    fireEvent.click(await screen.findByTestId("publish-optin"));
    fireEvent.change(screen.getByTestId("publish-link"), { target: { value: "https://dev.to/me/post" } });
    fireEvent.click(screen.getByTestId("publish-confirm"));
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ hash: "abc123" }), "https://dev.to/me/post");
  });

  it("explains why Publish is disabled when there are no measured results", async () => {
    vi.mocked(previewPublishPayload).mockResolvedValue(preview({ rows: [], excluded_count: 3, canonical_json: "[]" }));
    render(<PublishDialog verdicts={VERDICTS} onClose={noop} onPublish={noop} />);
    const empty = await screen.findByTestId("publish-empty");
    expect(empty).toHaveTextContent("Nothing to publish yet");
    expect(empty).toHaveTextContent("3 models were excluded");
    // No opt-in to tick and no payload shown — and Publish stays disabled with a reason.
    expect(screen.queryByTestId("publish-optin")).not.toBeInTheDocument();
    const confirm = screen.getByTestId("publish-confirm");
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute("title", "No measured results to publish yet");
  });

  it("keeps Publish disabled when a row fails local validation", async () => {
    vi.mocked(previewPublishPayload).mockResolvedValue(preview({ invalid: { index: 0, reason: "pass_k 1.5 out of range 0..=1" } }));
    render(<PublishDialog verdicts={VERDICTS} onClose={noop} onPublish={noop} />);
    fireEvent.click(await screen.findByTestId("publish-optin"));
    expect(screen.getByTestId("publish-confirm")).toBeDisabled();
    expect(screen.getByTestId("publish-invalid")).toHaveTextContent("out of range");
  });
});
