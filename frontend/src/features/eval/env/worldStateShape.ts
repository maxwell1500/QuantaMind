/// Per-environment validation of a task's `world_state` snapshot. The JSON editor (and the
/// Slice-4.5 structured editor) call this so a wrong-shaped snapshot is rejected with a clear,
/// env-specific message BEFORE it reaches the run — turning a typo into "this isn't valid" instead
/// of a confusing run failure. Returns `null` when the value is a valid snapshot for `environment`,
/// or a human message describing the expected shape. Mirrors the backend `from_world_state` readers
/// (env_fs / env_corpus / env_webui): all expect a JSON object; only the value shapes differ.

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateWorldStateShape(environment: string | undefined, value: unknown): string | null {
  if (!isPlainObject(value)) {
    return "world_state must be a JSON object.";
  }
  switch (environment) {
    case "filesystem":
      // path -> file-content string.
      for (const [path, content] of Object.entries(value)) {
        if (typeof content !== "string") {
          return `filesystem world_state must be a map of file path → file-content string (field "${path}" is not a string).`;
        }
      }
      return null;
    case "web_corpus":
      // doc_id -> { title, text } (or a bare string shorthand).
      for (const [id, doc] of Object.entries(value)) {
        if (typeof doc === "string") continue;
        if (!isPlainObject(doc) || typeof doc.title !== "string" || typeof doc.text !== "string") {
          return `web_corpus world_state must be a map of doc_id → { "title": string, "text": string } (or a bare string) — doc "${id}" doesn't match.`;
        }
      }
      return null;
    case "web_ui":
      // The UI state machine — any JSON object (routes/fields/toggles/submitted).
      return null;
    default:
      // entity / unspecified — the world_state is an opaque entity map; any object is accepted.
      return null;
  }
}
