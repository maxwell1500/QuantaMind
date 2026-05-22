import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import { HuggingFaceTab } from "../HuggingFaceTab";
import { HuggingFaceCatalog } from "../../../data/huggingface-catalog";

const cardCount = () =>
  screen.getByTestId("hf-grid").querySelectorAll('[data-testid^="hf-card-"]').length;

beforeEach(() => {});

describe("HuggingFaceTab (M.11)", () => {
  it("renders the full HF catalog when no search", () => {
    render(<HuggingFaceTab />);
    expect(cardCount()).toBe(HuggingFaceCatalog.length);
  });

  it("search 'qwen' filters to Qwen-family rows only", () => {
    render(<HuggingFaceTab />);
    fireEvent.change(screen.getByLabelText("Search Hugging Face"), {
      target: { value: "qwen" },
    });
    const expected = HuggingFaceCatalog.filter((e) =>
      `${e.repo} ${e.baseModel} ${e.family} ${e.description}`.toLowerCase().includes("qwen"),
    );
    expect(cardCount()).toBe(expected.length);
    expect(expected.length).toBeGreaterThan(0);
  });

  it("clicking a card opens the repo detail with variant table", () => {
    render(<HuggingFaceTab />);
    const first = HuggingFaceCatalog[0];
    fireEvent.click(screen.getByTestId(`hf-card-${first.repo}`));
    expect(screen.getByTestId("hf-repo-detail")).toBeInTheDocument();
    expect(screen.getByTestId("variant-table")).toBeInTheDocument();
    for (const v of first.variants) {
      expect(screen.getByTestId(`variant-${v.quantization}`)).toBeInTheDocument();
    }
  });

  it("Back returns from detail view to grid", () => {
    render(<HuggingFaceTab />);
    fireEvent.click(screen.getByTestId(`hf-card-${HuggingFaceCatalog[0].repo}`));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByTestId("hf-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("hf-repo-detail")).toBeNull();
  });
});
