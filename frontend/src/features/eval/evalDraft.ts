import { z } from "zod";
import {
  ToolSchemaSchema,
  ExpectedSchema,
  ToolTaskSchema,
  type ToolTask,
} from "../../shared/ipc/eval/registry";

// Reuse the canonical, struct-matching schemas so the inline form validation can
// never disagree with what the Rust backend (and the reload step) accept.
const ToolArraySchema = z.array(ToolSchemaSchema).min(1);

/// The editable working copy of one task. `key` is a stable React key, kept
/// independent of the user-editable `id` (editing the id must not remount the row).
export interface TaskDraft {
  key: string;
  id: string;
  category: ToolTask["category"];
  prompt: string;
  toolsJson: string;
  expectedJson: string;
  error: string | null;
}

// Monotonic source for stable draft keys.
let draftSeq = 0;
const nextDraftKey = () => `draft-${draftSeq++}`;

export function draftFromTask(task: ToolTask): TaskDraft {
  return {
    key: nextDraftKey(),
    id: task.id,
    category: task.category,
    prompt: task.prompt,
    toolsJson: JSON.stringify(task.tools, null, 2),
    expectedJson: JSON.stringify(task.expected, null, 2),
    error: null,
  };
}

export function newDraft(): TaskDraft {
  return {
    key: nextDraftKey(),
    id: "",
    category: "single",
    prompt: "",
    toolsJson: JSON.stringify(
      [{ name: "get_weather", description: "Get the current weather for a city", parameters: { type: "object", properties: { city: { type: "string", description: "City name" } }, required: ["city"] } }],
      null, 2,
    ),
    expectedJson: JSON.stringify({ type: "call", name: "get_weather", args: { city: "Paris" } }, null, 2),
    error: null,
  };
}

/// Validate one draft (category + prompt + tools JSON + expected JSON), mirroring
/// the backend's `validate_tasks` so a save can't pass here and fail there.
function validateTask(
  category: ToolTask["category"],
  prompt: string,
  toolsJson: string,
  expectedJson: string,
): { ok: true; task: Omit<ToolTask, "id" | "category"> } | { ok: false; err: string } {
  if (!prompt.trim()) return { ok: false, err: "Prompt: required" };

  let tools: unknown;
  try {
    tools = JSON.parse(toolsJson);
  } catch {
    return { ok: false, err: "Tools: invalid JSON" };
  }
  const tr = ToolArraySchema.safeParse(tools);
  if (!tr.success) return { ok: false, err: `Tools: ${tr.error.issues[0]?.message ?? "schema error"}` };

  let expected: unknown;
  try {
    expected = JSON.parse(expectedJson || "null");
  } catch {
    return { ok: false, err: "Expected Output: invalid JSON" };
  }
  const er = ExpectedSchema.safeParse(expected);
  if (!er.success) return { ok: false, err: `Expected: ${er.error.issues[0]?.message ?? "schema error"}` };

  if ((category === "abstain") !== (er.data.type === "no_call")) {
    return { ok: false, err: 'Expected: "abstain" category requires {"type":"no_call"} (and vice-versa)' };
  }

  return { ok: true, task: { prompt: prompt.trim(), tools: tr.data, expected: er.data } };
}

/// Validate every draft once — the single path shared by Save and per-task Run, so
/// the two can never disagree. On failure returns drafts with per-row errors set
/// plus a status message; on success the assembled task list. Each assembled task
/// is also checked against the canonical `ToolTaskSchema` as a backstop, so the
/// editor can never produce something the store's reload would reject.
export function validateDrafts(
  drafts: TaskDraft[],
): { ok: true; tasks: ToolTask[] } | { ok: false; drafts: TaskDraft[]; message: string } {
  if (drafts.length === 0) {
    return { ok: false, drafts, message: "⚠ Add at least one task" };
  }
  const tasks: ToolTask[] = [];
  let hasError = false;
  const checked = drafts.map((d) => {
    if (!d.id.trim()) {
      hasError = true;
      return { ...d, error: "Task ID: required" };
    }
    const r = validateTask(d.category, d.prompt, d.toolsJson, d.expectedJson);
    if (!r.ok) {
      hasError = true;
      return { ...d, error: r.err };
    }
    const task: ToolTask = { id: d.id.trim(), category: d.category, ...r.task };
    const canonical = ToolTaskSchema.safeParse(task);
    if (!canonical.success) {
      hasError = true;
      return { ...d, error: canonical.error.issues[0]?.message ?? "Invalid task" };
    }
    tasks.push(task);
    return { ...d, error: null };
  });
  if (hasError) return { ok: false, drafts: checked, message: "⚠ Fix validation errors" };
  return { ok: true, tasks };
}
