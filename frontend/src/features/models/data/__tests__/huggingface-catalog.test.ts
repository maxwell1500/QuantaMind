import { describe, it, expect } from "vitest";
import { HuggingFaceCatalog, HfRepoEntrySchema } from "../huggingface-catalog";

describe("HuggingFaceCatalog (M.11)", () => {
  it("loads at least 12 entries", () => {
    expect(HuggingFaceCatalog.length).toBeGreaterThanOrEqual(12);
  });

  it("every entry round-trips the schema", () => {
    for (const e of HuggingFaceCatalog) {
      expect(() => HfRepoEntrySchema.parse(e)).not.toThrow();
    }
  });

  it("every repo is namespace/name format", () => {
    for (const e of HuggingFaceCatalog) {
      expect(e.repo).toMatch(/^[A-Za-z0-9_\-.]+\/[A-Za-z0-9_\-.]+$/);
    }
  });

  it("every variant filename ends in .gguf", () => {
    for (const e of HuggingFaceCatalog) {
      for (const v of e.variants) {
        expect(v.filename.toLowerCase()).toMatch(/\.gguf$/);
      }
    }
  });

  it("repos are unique across the catalog", () => {
    const repos = HuggingFaceCatalog.map((e) => e.repo);
    expect(new Set(repos).size).toBe(repos.length);
  });
});
