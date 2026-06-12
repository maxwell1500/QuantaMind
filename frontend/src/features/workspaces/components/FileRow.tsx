import { useState } from "react";
import type { TreeNode } from "../../../shared/ipc/workspace/workspaces";

type Props = {
  node: Extract<TreeNode, { kind: "file" }>;
  active: boolean;
  onSelect: (p: string) => void;
  onRename: (p: string, name: string) => void;
  onDelete: (p: string) => void;
  depth: number;
};

export function FileRow({ node, active, onSelect, onRename, onDelete, depth }: Props) {
  const label = node.name.replace(/\.quantamind\.yaml$/, "");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label);
  const pad = 24 + depth * 12;

  const commit = () => {
    setEditing(false);
    if (name.trim() && name.trim() !== label) onRename(node.path, name);
    else setName(label);
  };
  const cancel = () => { setName(label); setEditing(false); };

  if (editing) {
    return (
      <li>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={cancel}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
          className="w-full text-sm border rounded px-2 py-1"
          style={{ marginLeft: pad - 8 }}
          data-testid={`file-rename-input-${label}`}
        />
      </li>
    );
  }
  return (
    <li className="group flex items-center">
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        onDoubleClick={() => { setName(label); setEditing(true); }}
        className={`flex-1 text-left px-2 py-1 rounded truncate ${
          active ? "bg-blue-50 text-blue-700" : "hover:bg-gray-100"
        }`}
        style={{ paddingLeft: pad }}
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
