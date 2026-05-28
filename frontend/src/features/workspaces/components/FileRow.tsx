import type { TreeNode } from "../../../shared/ipc/workspace/workspaces";

type Props = {
  node: Extract<TreeNode, { kind: "file" }>;
  active: boolean;
  onSelect: (p: string) => void;
  onDelete: (p: string) => void;
  depth: number;
};

export function FileRow({ node, active, onSelect, onDelete, depth }: Props) {
  const label = node.name.replace(/\.quantamind\.yaml$/, "");
  return (
    <li className="group flex items-center">
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={`flex-1 text-left px-2 py-1 rounded truncate ${
          active ? "bg-blue-50 text-blue-700" : "hover:bg-gray-100"
        }`}
        style={{ paddingLeft: 24 + depth * 12 }}
      >
        {label}
      </button>
      <button
        type="button"
        onClick={() => onDelete(node.path)}
        className="opacity-0 group-hover:opacity-100 px-2 text-xs text-gray-500 hover:text-red-600"
        aria-label={`Delete ${label}`}
      >
        ✕
      </button>
    </li>
  );
}
