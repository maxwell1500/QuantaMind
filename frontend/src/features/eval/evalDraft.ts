import { z } from "zod";
import {
  ToolSchemaSchema,
  ExpectedSchema,
  AgenticSpecSchema,
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
  /// The Deterministic Sandbox (mock answers) JSON, used only for `category ===
  /// "agentic"`. Empty for single-turn tasks.
  mocksJson: string;
  /// The End-State Checklist (success criteria) JSON, used only for agentic tasks.
  endStateJson: string;
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
    mocksJson: task.agentic ? JSON.stringify(task.agentic.mocks, null, 2) : "",
    endStateJson: task.agentic ? JSON.stringify(task.agentic.end_state, null, 2) : "",
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
    // Templates so switching a draft to "Multi-Step Agent" starts from a working
    // sandbox + ordered end-state checklist rather than a blank box.
    mocksJson: JSON.stringify(
      [{ call: { name: "check_balance", args: { account_id: "ACC-123" } }, response: '{"status":200,"balance":450.00}' }],
      null, 2,
    ),
    endStateJson: JSON.stringify(
      { require_sequence: [
        { tool: "check_balance", args: { account_id: "ACC-123" } },
        { tool: "transfer", args: { amount: 450.0 } },
      ] },
      null, 2,
    ),
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
  mocksJson: string,
  endStateJson: string,
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

  // Agentic tasks score via their end_state, not `expected`, so the single-turn
  // abstain/expected gate is skipped (mirrors the backend's validate_tasks). The
  // mocks + end-state come from two configurator boxes, assembled into one spec.
  if (category === "agentic") {
    let mocks: unknown;
    try {
      mocks = JSON.parse(mocksJson || "[]");
    } catch {
      return { ok: false, err: "Sandbox (Mock Answers): invalid JSON" };
    }
    let endState: unknown;
    try {
      endState = JSON.parse(endStateJson || "null");
    } catch {
      return { ok: false, err: "End-State Checklist: invalid JSON" };
    }
    const ar = AgenticSpecSchema.safeParse({ mocks, end_state: endState });
    if (!ar.success) return { ok: false, err: `Agentic: ${ar.error.issues[0]?.message ?? "schema error"}` };
    return { ok: true, task: { prompt: prompt.trim(), tools: tr.data, expected: er.data, agentic: ar.data } };
  }

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
    const r = validateTask(d.category, d.prompt, d.toolsJson, d.expectedJson, d.mocksJson, d.endStateJson);
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
