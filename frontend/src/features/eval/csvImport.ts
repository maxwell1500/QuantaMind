import type { ToolTask } from "../../shared/ipc/eval/registry";
import { validateDrafts, type TaskDraft } from "./evalDraft";

/// The strict header the importer accepts, in this exact order. The CSV carries
/// per-case data only; tool schemas are supplied once (the shared Tools box) and
/// applied to every row. Single-turn only — parallel/agentic stay in JSON import.
export const EXPECTED_HEADER = ["id", "prompt", "expected_tool", "expected_args"] as const;

export interface CsvRowPreview {
  row: number; // 1-based DATA row (row 1 = first line after the header)
  id: string;
  category: string; // "single" | "abstain"
  ok: boolean;
  message?: string;
}

export interface CsvImportResult {
  headerError: string | null;
  toolsError: string | null;
  rows: CsvRowPreview[];
  /// Non-null ONLY when the header, tools box, and every row are valid — so the
  /// modal can never import a partially-broken CSV.
  tasks: ToolTask[] | null;
}

/// Quote-aware RFC-4180 parser (the read counterpart of `csvCell` in exportBatch):
/// handles embedded commas, `""` escapes, and newlines inside quoted fields. CRLF
/// is normalized; fully-blank lines are dropped.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  // Drop fully-blank lines (a single empty field), but keep ",,," style rows so a
  // missing id surfaces as a row error rather than silently vanishing.
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/// Parse + strictly validate a CSV against the shared Tools box, returning a
/// per-row preview and (only when fully clean) the assembled ToolTask[]. The
/// final assembly + schema check is delegated to `validateDrafts` so CSV-derived
/// tasks pass the identical gate the form editor uses.
export function csvToCollection(text: string, toolsJson: string): CsvImportResult {
  const grid = parseCsv(text);
  if (grid.length === 0) {
    return { headerError: "The CSV is empty.", toolsError: null, rows: [], tasks: null };
  }

  // 1. Header — exact columns, exact order (case-insensitive, trimmed).
  const header = grid[0].map((h) => h.trim().toLowerCase());
  let headerError: string | null = null;
  if (header.length !== EXPECTED_HEADER.length) {
    headerError = `Header must have exactly ${EXPECTED_HEADER.length} columns (${EXPECTED_HEADER.join(", ")}) — got ${header.length}.`;
  } else {
    const wrong = EXPECTED_HEADER.findIndex((h, i) => header[i] !== h);
    if (wrong !== -1) {
      headerError = `Column ${wrong + 1} must be \`${EXPECTED_HEADER[wrong]}\`, got \`${grid[0][wrong].trim() || "(empty)"}\`.`;
    }
  }

  // 2. Tools box — valid JSON, non-empty array. Deep schema is checked later by
  //    validateDrafts; here we just need the names for the membership check.
  let toolsError: string | null = null;
  let toolNames: string[] = [];
  try {
    const parsed = JSON.parse(toolsJson || "null");
    if (!Array.isArray(parsed) || parsed.length === 0) {
      toolsError = "Tools schema must be a non-empty JSON array of tool definitions.";
    } else {
      toolNames = parsed.filter((t) => t && typeof t.name === "string").map((t) => t.name as string);
    }
  } catch {
    toolsError = "Tools schema is not valid JSON.";
  }

  const dataRows = grid.slice(1);
  const rows: CsvRowPreview[] = [];
  const seenIds = new Set<string>();

  dataRows.forEach((cells, idx) => {
    const row = idx + 1;
    const id = (cells[0] ?? "").trim();
    const prompt = (cells[1] ?? "").trim();
    const tool = (cells[2] ?? "").trim();
    const argsRaw = (cells[3] ?? "").trim();
    const category = tool ? "single" : "abstain";
    const fail = (message: string): CsvRowPreview => ({ row, id, category, ok: false, message });

    if (cells.length !== EXPECTED_HEADER.length) {
      rows.push(fail(`Expected ${EXPECTED_HEADER.length} columns, got ${cells.length}.`));
      return;
    }
    if (!id) { rows.push(fail("`id` is required.")); return; }
    if (seenIds.has(id)) { rows.push(fail(`Duplicate id \`${id}\`.`)); return; }
    seenIds.add(id);
    if (!prompt) { rows.push(fail("`prompt` is required.")); return; }

    if (tool) {
      if (argsRaw) {
        let parsedArgs: unknown;
        try { parsedArgs = JSON.parse(argsRaw); } catch { rows.push(fail("`expected_args` is not valid JSON.")); return; }
        if (typeof parsedArgs !== "object" || parsedArgs === null || Array.isArray(parsedArgs)) {
          rows.push(fail("`expected_args` must be a JSON object."));
          return;
        }
      }
      if (!toolsError && !toolNames.includes(tool)) {
        rows.push(fail(`Tool \`${tool}\` is not declared in the Tools schema box.`));
        return;
      }
    } else if (argsRaw) {
      rows.push(fail("`expected_args` must be empty when `expected_tool` is empty (abstain row)."));
      return;
    }

    rows.push({ row, id, category, ok: true });
  });

  // Only assemble + run the canonical validator when everything passed the strict
  // pre-checks; otherwise tasks stay null and the modal blocks the import.
  let tasks: ToolTask[] | null = null;
  const allRowsOk = rows.length > 0 && rows.every((r) => r.ok);
  if (!headerError && !toolsError && allRowsOk) {
    const drafts: TaskDraft[] = dataRows.map((cells, idx) => {
      const tool = (cells[2] ?? "").trim();
      const argsRaw = (cells[3] ?? "").trim();
      const expected = tool
        ? { type: "call", name: tool, args: argsRaw ? JSON.parse(argsRaw) : {} }
        : { type: "no_call" };
      return {
        key: `csv-${idx}`,
        id: (cells[0] ?? "").trim(),
        category: tool ? "single" : "abstain",
        prompt: (cells[1] ?? "").trim(),
        toolsJson,
        expectedJson: JSON.stringify(expected),
        mocksJson: "",
        endStateJson: "",
        faultsJson: "",
        maxRecovery: "",
        error: null,
      };
    });
    const result = validateDrafts(drafts);
    if (result.ok) {
      tasks = result.tasks;
    } else {
      // Defense in depth: surface any canonical-schema rejection on its row.
      result.drafts.forEach((d, idx) => {
        if (d.error && rows[idx]) { rows[idx] = { ...rows[idx], ok: false, message: d.error }; }
      });
    }
  }

  return { headerError, toolsError, rows, tasks };
}
