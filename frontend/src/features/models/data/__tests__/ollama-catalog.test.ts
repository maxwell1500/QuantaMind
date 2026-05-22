import { describe, it, expect } from "vitest";
import { OllamaCatalog, ModelCatalogEntrySchema } from "../ollama-catalog";

describe("OllamaCatalog (M.4)", () => {
  it("loads and validates at least 25 entries", () => {
    expect(OllamaCatalog.length).toBeGreaterThanOrEqual(25);
  });

  it("each entry round-trips the schema", () => {
    for (const e of OllamaCatalog) {
      expect(() => ModelCatalogEntrySchema.parse(e)).not.toThrow();
    }
  });

  it("covers every tag category at least once", () => {
    const tags = new Set(OllamaCatalog.flatMap((e) => e.tags));
    for (const required of ["chat", "coding", "embedding", "vision", "small", "medium", "large"]) {
      expect(tags.has(required as never), `missing tag: ${required}`).toBe(true);
    }
  });

  it("names are unique (no duplicate catalog rows)", () => {
    const names = OllamaCatalog.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
