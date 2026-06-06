import { describe, it, expect } from "vitest";
import { isAllowedWriteupLink } from "../writeupLink";

describe("isAllowedWriteupLink", () => {
  it("allows an empty link (it's optional)", () => {
    expect(isAllowedWriteupLink("")).toBe(true);
    expect(isAllowedWriteupLink("   ")).toBe(true);
  });

  it("accepts allow-listed https hosts incl. subdomains", () => {
    for (const u of [
      "https://github.com/me/repo",
      "https://gist.github.com/me/abc",
      "https://x.com/me/status/1",
      "https://dev.to/me/post",
      "https://www.reddit.com/r/LocalLLaMA/x",
      "https://huggingface.co/me/model",
    ]) {
      expect(isAllowedWriteupLink(u)).toBe(true);
    }
  });

  it("rejects non-https, unlisted domains, and garbage", () => {
    expect(isAllowedWriteupLink("http://github.com/me")).toBe(false); // not https
    expect(isAllowedWriteupLink("https://evil.com/x")).toBe(false); // unlisted
    expect(isAllowedWriteupLink("https://notgithub.com/x")).toBe(false); // suffix spoof
    expect(isAllowedWriteupLink("ftp://github.com")).toBe(false);
    expect(isAllowedWriteupLink("just some text")).toBe(false);
  });
});
