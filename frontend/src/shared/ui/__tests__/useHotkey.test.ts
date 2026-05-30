import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { matchCombo, useHotkey } from "../useHotkey";

const ev = (key: string, mods: Partial<KeyboardEvent> = {}) =>
  new KeyboardEvent("keydown", { key, ...mods });

describe("matchCombo", () => {
  it("matches mod+enter via metaKey or ctrlKey", () => {
    expect(matchCombo(ev("Enter", { metaKey: true }), "mod+enter")).toBe(true);
    expect(matchCombo(ev("Enter", { ctrlKey: true }), "mod+enter")).toBe(true);
  });

  it("requires the modifier when the combo asks for it", () => {
    expect(matchCombo(ev("Enter"), "mod+enter")).toBe(false);
  });

  it("rejects the modifier when the combo does not ask for it", () => {
    expect(matchCombo(ev("a", { metaKey: true }), "a")).toBe(false);
    expect(matchCombo(ev("a"), "a")).toBe(true);
  });

  it("matches punctuation combos", () => {
    expect(matchCombo(ev(".", { metaKey: true }), "mod+.")).toBe(true);
    expect(matchCombo(ev("/", { metaKey: true }), "mod+/")).toBe(true);
    expect(matchCombo(ev(",", { metaKey: true }), "mod+,")).toBe(true);
  });

  it("honors shift", () => {
    expect(matchCombo(ev("K", { metaKey: true, shiftKey: true }), "mod+shift+k")).toBe(true);
    expect(matchCombo(ev("k", { metaKey: true }), "mod+shift+k")).toBe(false);
  });
});

describe("useHotkey", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fires the handler on a matching keydown", () => {
    const fn = vi.fn();
    renderHook(() => useHotkey("mod+enter", fn));
    document.dispatchEvent(ev("Enter", { metaKey: true }));
    expect(fn).toHaveBeenCalledOnce();
  });

  it("does not fire when disabled", () => {
    const fn = vi.fn();
    renderHook(() => useHotkey("mod+enter", fn, false));
    document.dispatchEvent(ev("Enter", { metaKey: true }));
    expect(fn).not.toHaveBeenCalled();
  });

  it("ignores non-matching keys", () => {
    const fn = vi.fn();
    renderHook(() => useHotkey("mod+s", fn));
    document.dispatchEvent(ev("x", { metaKey: true }));
    expect(fn).not.toHaveBeenCalled();
  });
});
