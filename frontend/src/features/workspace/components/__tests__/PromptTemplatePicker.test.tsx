import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { PromptTemplatePicker } from "../PromptTemplatePicker";

beforeEach(() => vi.mocked(invoke).mockReset());

describe("PromptTemplatePicker", () => {
  it("renders nothing when there are no templates", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    const { container } = render(<PromptTemplatePicker onInsert={() => {}} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("list_prompt_templates"));
    expect(container.querySelector("[data-testid='prompt-template-picker']")).toBeNull();
  });

  it("lists templates and inserts the chosen body", async () => {
    vi.mocked(invoke).mockResolvedValue([
      { name: "summarize", body: "Summarize:\n{{input}}" },
      { name: "code-review", body: "Review this." },
    ]);
    const onInsert = vi.fn();
    render(<PromptTemplatePicker onInsert={onInsert} />);
    await waitFor(() => expect(screen.getByText("summarize")).toBeInTheDocument());
    fireEvent.change(screen.getByTestId("prompt-template-picker"), { target: { value: "code-review" } });
    expect(onInsert).toHaveBeenCalledWith("Review this.");
  });
});
