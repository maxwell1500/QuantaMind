import { describe, it, expect } from "vitest";
import { isEmbeddingModel } from "../classify";

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
