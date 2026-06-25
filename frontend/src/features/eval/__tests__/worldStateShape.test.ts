import { describe, it, expect } from "vitest";
import { validateWorldStateShape } from "../env/worldStateShape";

describe("validateWorldStateShape", () => {
  it("rejects a non-object snapshot for any env", () => {
    expect(validateWorldStateShape("filesystem", [])).toMatch(/must be a JSON object/);
    expect(validateWorldStateShape("web_ui", "x")).toMatch(/must be a JSON object/);
    expect(validateWorldStateShape("web_corpus", 42)).toMatch(/must be a JSON object/);
  });

  it("filesystem: every value must be a file-content string", () => {
    expect(validateWorldStateShape("filesystem", { "a.txt": "hi", "b.yaml": "x: 1" })).toBeNull();
    expect(validateWorldStateShape("filesystem", { "a.txt": 123 })).toMatch(/file path → file-content string/);
  });

  it("web_corpus: each doc is {title,text} or a bare string", () => {
    expect(validateWorldStateShape("web_corpus", { d1: { title: "T", text: "B" }, d2: "bare" })).toBeNull();
    expect(validateWorldStateShape("web_corpus", { d1: { title: "T" } })).toMatch(/doc_id → /);
    expect(validateWorldStateShape("web_corpus", { d1: { title: 1, text: "b" } })).toMatch(/doc_id → /);
  });

  it("web_ui / entity: any object is accepted", () => {
    expect(validateWorldStateShape("web_ui", { route: "/cart", submitted: false })).toBeNull();
    expect(validateWorldStateShape("entity", { order: { id: 1 } })).toBeNull();
    expect(validateWorldStateShape(undefined, { anything: true })).toBeNull();
  });
});
