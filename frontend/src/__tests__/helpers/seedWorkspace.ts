import { useWorkspacesStore } from "../../features/workspaces/state/workspaceStore";
import type { PromptFile } from "../../shared/ipc/prompts";

/// Put the workspaces store into a state where one prompt is open, so
/// the Workspace editors render in tests. v0.1 tests assumed prompts were
/// always editable; post-2.4 the editors are gated on an open prompt.
export function seedCurrentPrompt(overrides: Partial<PromptFile> = {}): PromptFile {
  const prompt: PromptFile = {
    name: "test",
    system: "",
    user: "",
    model: null,
    params: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    auto_rerun: false,
    ...overrides,
  };
  useWorkspacesStore.setState({
    root: "/ws",
    tree: [],
    currentPath: "/ws/test.quantamind.yaml",
    current: prompt,
    dirty: false,
  });
  return prompt;
}
