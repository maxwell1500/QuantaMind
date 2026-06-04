import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

const PropertySchema = z.object({ type: z.string(), description: z.string().optional() });

/// JSON-Schema `parameters` block — the shape developers paste from real tool
/// defs. Zod here is UX only (the backend re-validates every task it runs).
export const ParametersSchema = z.object({
  type: z.literal("object"),
  properties: z.record(z.string(), PropertySchema),
  required: z.array(z.string()).optional(),
});

export const ToolSchemaSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  parameters: ParametersSchema,
});

const CallSchema = z.object({ name: z.string().min(1), args: z.record(z.string(), z.unknown()) });

export const ExpectedSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("call"), name: z.string().min(1), args: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("parallel"), calls: z.array(CallSchema).min(1) }),
  z.object({ type: z.literal("no_call") }),
]);

// --- Agentic (multi-step) task spec — mirrors backend agentic::spec/sandbox ---

const TaskCheckpointSchema = z.object({ tool: z.string().min(1), args: z.record(z.string(), z.unknown()) });
const MockResponseSchema = z.object({ call: CallSchema, response: z.string() });

/// Mirrors the externally-tagged Rust `EndStateRule`: a unit variant serializes
/// to the bare string `"expect_abstaining_text"`; the tuple variant to
/// `{ "require_sequence": [...] }`.
export const EndStateRuleSchema = z.union([
  z.object({ require_sequence: z.array(TaskCheckpointSchema).min(1) }),
  z.literal("expect_abstaining_text"),
]);

export const AgenticSpecSchema = z.object({
  mocks: z.array(MockResponseSchema),
  end_state: EndStateRuleSchema,
  k: z.number().int().positive().optional(),
  max_steps: z.number().int().positive().optional(),
});
export type AgenticSpec = z.infer<typeof AgenticSpecSchema>;

export const ToolTaskSchema = z
  .object({
    id: z.string().min(1),
    category: z.enum(["single", "parallel", "select", "abstain", "agentic"]),
    prompt: z.string().min(1),
    tools: z.array(ToolSchemaSchema).min(1),
    expected: ExpectedSchema,
    agentic: AgenticSpecSchema.optional(),
  })
  .superRefine((t, ctx) => {
    if (t.category === "agentic" && !t.agentic)
      ctx.addIssue({ code: "custom", message: "agentic task requires an agentic spec", path: ["agentic"] });
    if (t.category !== "agentic" && t.agentic)
      ctx.addIssue({ code: "custom", message: "only agentic tasks may carry an agentic spec", path: ["agentic"] });
  });
export type ToolTask = z.infer<typeof ToolTaskSchema>;

const TaskArraySchema = z.array(ToolTaskSchema);

/// The bundled curated suite (read once, behind a command, so the runner is
/// always handed a Vec).
export async function getBuiltinTasks(): Promise<ToolTask[]> {
  return TaskArraySchema.parse(await invoke("get_builtin_tasks"));
}

export const BuiltinCollectionInfoSchema = z.object({ id: z.string(), label: z.string() });
export type BuiltinCollectionInfo = z.infer<typeof BuiltinCollectionInfoSchema>;

/// The read-only built-in presets (id + label) for the dataset picker.
export async function listBuiltinCollections(): Promise<BuiltinCollectionInfo[]> {
  return z.array(BuiltinCollectionInfoSchema).parse(await invoke("list_builtin_collections"));
}

/// Tasks for a built-in preset id (e.g. "curated" / "finance").
export async function getBuiltinCollection(id: string): Promise<ToolTask[]> {
  return TaskArraySchema.parse(await invoke("get_builtin_collection", { id }));
}

export async function listCustomCollections(): Promise<string[]> {
  return z.array(z.string()).parse(await invoke("list_custom_collections"));
}

export async function loadCustomCollection(name: string): Promise<ToolTask[]> {
  return TaskArraySchema.parse(await invoke("load_custom_collection", { name }));
}

export async function saveCustomCollection(name: string, tasks: ToolTask[]): Promise<void> {
  await invoke("save_custom_collection", { name, tasks });
}

export async function deleteCustomCollection(name: string): Promise<void> {
  await invoke("delete_custom_collection", { name });
}

/// Import an external `.json` by PATH — Rust reads + caps + validates it; the
/// frontend never loads file contents. Returns the new collection name.
export async function importCustomCollection(sourcePath: string): Promise<string> {
  return z.string().parse(await invoke("import_custom_collection", { sourcePath }));
}
