import { useRef, useState, type RefObject } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { useToast } from "../../../shared/ui/Toast";
import { usePopoverDismiss } from "../../../shared/ui/usePopoverDismiss";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { saveReadinessImage } from "../../../shared/ipc/publish/export";
import { download } from "../../eval/exportBatch";
import { buildReadinessHtml } from "../reportHtml";
import { buildReadinessMarkdown } from "../export/markdown";
import { snapshotPng } from "../export/snapshot";
import type { HardwareSnapshot } from "../../../shared/ipc/compare/hardware";
import type { ModelVerdict, ReadinessProfile } from "../../../shared/ipc/eval/readiness";

interface Props {
  verdicts: ModelVerdict[];
  profile: ReadinessProfile;
  collectionId: string;
  hardware: HardwareSnapshot | null;
  /// The report card (banner + table) to rasterize for the PNG share.
  cardRef: RefObject<HTMLDivElement | null>;
}

const ITEM = "w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer";

/// The offline share menu: a PNG card (snapshot → OS save dialog → Rust write),
/// the Markdown summary (to clipboard), and the existing self-contained HTML
/// one-pager. All fully offline, no auth — the Phase 8 go-to-market lever.
export function ExportMenu({ verdicts, profile, collectionId, hardware, cardRef }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(open, menuRef, () => setOpen(false));
  const iso = () => new Date().toISOString();

  const onImage = async () => {
    setOpen(false);
    const node = cardRef.current;
    if (!node) return;
    try {
      const bytes = await snapshotPng(node);
      const path = await save({ defaultPath: `quantamind-readiness-${collectionId}.png`, filters: [{ name: "PNG", extensions: ["png"] }] });
      if (!path) return;
      await saveReadinessImage(path, bytes);
      toast("Readiness image saved ✓");
    } catch (e) {
      toast(`Image export failed — ${formatIpcError(e)}`);
    }
  };

  const onMarkdown = async () => {
    setOpen(false);
    const md = buildReadinessMarkdown(verdicts, profile, collectionId, iso(), hardware);
    // The Clipboard API needs a secure context AND document focus; if focus shifts
    // mid-generate the promise rejects — surface it instead of a silent no-op.
    try {
      await navigator.clipboard.writeText(md);
      toast("Markdown copied ✓");
    } catch (err) {
      console.error("Clipboard rejection:", err);
      toast("Failed to copy — ensure the app has focus");
    }
  };

  const onHtml = () => {
    setOpen(false);
    download(`readiness-${collectionId}.html`, buildReadinessHtml(verdicts, profile, collectionId, iso()), "text/html");
    toast("Readiness report exported ✓");
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        data-testid="readiness-export"
        className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold py-2 px-4 shadow-sm transition-all cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Export Report</span>
        <span className="text-xs">▾</span>
      </button>
      {open && (
        <div
          data-testid="readiness-export-menu"
          className="absolute right-0 bottom-full mb-2 w-52 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-10"
        >
          <button type="button" data-testid="export-image" className={ITEM} onClick={() => void onImage()}>Export as Image (.png)</button>
          <button type="button" data-testid="export-markdown" className={ITEM} onClick={() => void onMarkdown()}>Copy Markdown</button>
          <button type="button" data-testid="export-html" className={ITEM} onClick={onHtml}>Export HTML</button>
        </div>
      )}
    </div>
  );
}
