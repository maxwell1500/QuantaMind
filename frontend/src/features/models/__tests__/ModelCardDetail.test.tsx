import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));

import { open } from "@tauri-apps/plugin-shell";
import { ModelCardDetail } from "../components/card/ModelCardDetail";

const card = {
  description: "Meta Llama 3.1 is a collection of multilingual models.",
  license: "llama3.1",
  base_model: "meta-llama/Meta-Llama-3.1-8B",
  pipeline_tag: "text-generation",
  tags: ["transformers", "unsloth"],
};

beforeEach(() => vi.clearAllMocks());

describe("ModelCardDetail", () => {
  it("renders badges, description and tags as native components", () => {
    render(<ModelCardDetail repo="meta/llama" card={card} />);
    expect(screen.getByTestId("model-card-desc")).toHaveTextContent("Meta Llama 3.1");
    expect(screen.getByText("text-generation")).toBeTruthy();
    expect(screen.getByText("llama3.1")).toBeTruthy();
    expect(screen.getByTestId("model-card-tags")).toHaveTextContent("transformers");
  });

  it("opens the full card on Hugging Face via the shell", () => {
    render(<ModelCardDetail repo="meta/llama" card={card} />);
    fireEvent.click(screen.getByTestId("model-card-open"));
    expect(open).toHaveBeenCalledWith("https://huggingface.co/meta/llama");
  });
});
