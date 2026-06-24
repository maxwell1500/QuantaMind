import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

const TreeFileSchema = z.object({
  kind: z.literal("file"),
  name: z.string(),
  path: z.string(),
});

type TreeFile = z.infer<typeof TreeFileSchema>;
export type TreeNode = TreeFile | { kind: "folder"; name: string; path: string; children: TreeNode[] };

const TreeFolderSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    kind: z.literal("folder"),
    name: z.string(),
    path: z.string(),
    children: z.array(z.union([TreeFileSchema, TreeFolderSchema])),
  }),
);

const TreeNodeSchema: z.ZodType<TreeNode> = z.union([TreeFileSchema, TreeFolderSchema]);

export const RecentEntrySchema = z.object({
  path: z.string(),
  opened_at: z.string(),
});
export type RecentEntry = z.infer<typeof RecentEntrySchema>;

export const RecentListSchema = z.object({ entries: z.array(RecentEntrySchema) });
export type RecentList = z.infer<typeof RecentListSchema>;

export async function openWorkspace(path: string): Promise<TreeNode[]> {
  const raw = await invoke("open_workspace", { path });
  return z.array(TreeNodeSchema).parse(raw);
}

export async function listWorkspaceTree(): Promise<TreeNode[]> {
  const raw = await invoke("list_workspace_tree");
  return z.array(TreeNodeSchema).parse(raw);
}

export async function recentWorkspaces(): Promise<RecentList> {
  const raw = await invoke("recent_workspaces");
  return RecentListSchema.parse(raw);
}

export async function deletePath(path: string): Promise<TreeNode[]> {
  const raw = await invoke("delete_path", { path });
  return z.array(TreeNodeSchema).parse(raw);
}

export async function closeWorkspace(): Promise<void> {
  await invoke("close_workspace");
}

export async function currentWorkspace(): Promise<string | null> {
  const raw = await invoke("current_workspace");
  return z.string().nullable().parse(raw);
}
