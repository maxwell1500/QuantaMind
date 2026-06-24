import { describe, it, expect } from "vitest";
import { isEmbeddingModel, isLikelyThinkingModel } from "../classify";

describe("isEmbeddingModel", () => {
  it.each([
    ["nomic-embed-text:latest", "nomic-bert"],
    ["snowflake-arctic-embed:l", "bert"],
    ["mxbai-embed-large:latest", "bert"],
    ["bge-m3:567m", "bert"],
    ["bge-large:latest", "bert"],
    ["all-minilm:22m", "bert"],
    // family alone is enough — name doesn't carry "embed"
    ["custom-name:v1", "nomic-bert"],
    // name alone is enough — family field empty
    ["something-embed-here:latest", ""],
  ])("returns true for embedding model %s (family %s)", (name, family) => {
    expect(isEmbeddingModel({ name, family })).toBe(true);
  });

  it.each([
    ["llama3.2:1b", "llama"],
    ["mistral:7b", "llama"],
    ["qwen2.5:7b", "qwen2"],
    ["phi3.5:latest", "phi3"],
    ["gemma2:9b", "gemma2"],
    ["random-name:tag", ""],
  ])("returns false for generative model %s (family %s)", (name, family) => {
    expect(isEmbeddingModel({ name, family })).toBe(false);
  });

  it("is case-insensitive on both fields", () => {
    expect(isEmbeddingModel({ name: "Nomic-Embed-Text:LATEST", family: "NOMIC-BERT" })).toBe(true);
  });

  it("treats absent family as empty", () => {
    expect(isEmbeddingModel({ name: "llama3.2:1b" })).toBe(false);
    expect(isEmbeddingModel({ name: "nomic-embed-text:latest" })).toBe(true);
  });
});

describe("isLikelyThinkingModel", () => {
  it.each([
    "qwen3.5:9b",
    "qwen3:8b",
    "qwen3.6-35b-a3b",
    "qwq:32b",
    "deepseek-r1:7b",
    "deepseek-r1-distill-qwen-7b",
    "magistral-small:24b",
    "gpt-oss:20b",
    "Phi-4-reasoning:latest", // case-insensitive
  ])("detects reasoning model %s", (name) => {
    expect(isLikelyThinkingModel(name)).toBe(true);
  });

  it.each([
    "gemma-4-12b-it:q4", // gemma is not a reasoner
    "qwen2.5-coder-7b-instruct", // qwen2.5, NOT qwen3
    "qwen2.5:7b",
    "llama3.2:3b",
    "mistral:7b",
    "phi3.5:latest",
  ])("does not flag non-reasoning model %s", (name) => {
    expect(isLikelyThinkingModel(name)).toBe(false);
  });
});
