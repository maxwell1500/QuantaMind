import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));
vi.mock("../../../shared/ipc/models/hf_browse", () => ({ hfModelCard: vi.fn() }));

import { hfModelCard } from "../../../shared/ipc/models/hf_browse";
import { ModelCardSection } from "../components/card/ModelCardSection";

const card = {
  description: "A model.", license: "mit", base_model: null,
  pipeline_tag: "text-generation", tags: ["llama"],
};

beforeEach(() => vi.clearAllMocks());

describe("ModelCardSection", () => {
  it("fetches and renders the card only after it's opened", async () => {
    vi.mocked(hfModelCard).mockResolvedValue(card);
    render(<ModelCardSection repo="meta/llama" />);
    expect(hfModelCard).not.toHaveBeenCalled(); // lazy until opened
    fireEvent.click(screen.getByTestId("model-card-toggle"));
    expect(await screen.findByTestId("model-card-body")).toBeTruthy();
    expect(hfModelCard).toHaveBeenCalledWith("meta/llama");
  });

  it("shows a friendly note when the repo has no card", async () => {
    vi.mocked(hfModelCard).mockResolvedValue(null);
    render(<ModelCardSection repo="x/y" />);
    fireEvent.click(screen.getByTestId("model-card-toggle"));
    expect(await screen.findByText(/No model card/)).toBeTruthy();
  });
});
