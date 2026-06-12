import { getFontEmbedCSS, toBlob } from "html-to-image";

/// Rasterize a report-card DOM node to PNG bytes for offline sharing.
///
/// `html-to-image` clones the node into an SVG `<foreignObject>`; if the web font
/// (Inter) and inline SVGs aren't embedded into that clone, the export falls back
/// to a system serif with a broken layout. Two guards fix that:
///  1. resolve the @font-face CSS once (`getFontEmbedCSS`) and feed it to the real
///     capture so the fonts ship as data URIs, and
///  2. do a throwaway warm-up render first to force the engine to load those assets
///     before the capture that actually matters.
///
/// `backgroundColor: "#ffffff"` is hardcoded so a dropped background never exports
/// white-on-transparent (invisible when shared on X/Reddit); `pixelRatio: 2` keeps
/// the share image crisp.
export async function snapshotPng(node: HTMLElement): Promise<Uint8Array> {
  const fontEmbedCSS = await getFontEmbedCSS(node);
  await toBlob(node, { cacheBust: true, fontEmbedCSS, style: { opacity: "0" } });
  const blob = await toBlob(node, { backgroundColor: "#ffffff", pixelRatio: 2, fontEmbedCSS });
  if (!blob) throw new Error("snapshot produced no image");
  return new Uint8Array(await blob.arrayBuffer());
}
