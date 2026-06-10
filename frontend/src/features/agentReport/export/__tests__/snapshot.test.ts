import { describe, it, expect, vi, beforeEach } from "vitest";

const toBlob = vi.fn();
const getFontEmbedCSS = vi.fn();
vi.mock("html-to-image", () => ({ toBlob: (...a: unknown[]) => toBlob(...a), getFontEmbedCSS: (...a: unknown[]) => getFontEmbedCSS(...a) }));

import { snapshotPng } from "../snapshot";

const fakeBlob = (bytes: number[]) => ({ arrayBuffer: async () => new Uint8Array(bytes).buffer }) as unknown as Blob;

describe("snapshotPng", () => {
  beforeEach(() => {
    toBlob.mockReset();
    getFontEmbedCSS.mockReset();
    getFontEmbedCSS.mockResolvedValue("@font-face{...}");
  });

  it("warms up then captures on a solid white background at 2x and returns the bytes", async () => {
    toBlob.mockResolvedValueOnce(fakeBlob([0])).mockResolvedValueOnce(fakeBlob([0x89, 0x50, 0x4e, 0x47]));
    const node = {} as HTMLElement;

    const out = await snapshotPng(node);

    expect(getFontEmbedCSS).toHaveBeenCalledWith(node);
    expect(toBlob).toHaveBeenCalledTimes(2);
    // The second (real) capture forces the white background + 2x scale + embedded fonts.
    const finalOpts = toBlob.mock.calls[1][1];
    expect(finalOpts.backgroundColor).toBe("#ffffff");
    expect(finalOpts.pixelRatio).toBe(2);
    expect(finalOpts.fontEmbedCSS).toBe("@font-face{...}");
    expect(Array.from(out)).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("throws when the library yields no blob", async () => {
    toBlob.mockResolvedValueOnce(fakeBlob([0])).mockResolvedValueOnce(null);
    await expect(snapshotPng({} as HTMLElement)).rejects.toThrow(/no image/);
  });
});
