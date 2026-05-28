import { useState } from "react";
import type { TreeNode } from "../../../shared/ipc/workspace/workspaces";
import { FileRow } from "./FileRow";

type Props = {
  nodes: TreeNode[];
  currentPath: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  depth?: number;
};

export function FilesTree({ nodes, currentPath, onSelect, onDelete, depth = 0 }: Props) {
  return (
    <ul className="text-sm">
      {nodes.map((node) =>
        node.kind === "folder" ? (
          <FolderRow
            key={node.path}
            node={node}
            currentPath={currentPath}
            onSelect={onSelect}
            onDelete={onDelete}
            depth={depth}
          />
        ) : (
          <FileRow
            key={node.path}
            node={node}
            active={node.path === currentPath}
            onSelect={onSelect}
            onDelete={onDelete}
            depth={depth}
          />
        ),
      )}
    </ul>
  );
}

function FolderRow({ node, currentPath, onSelect, onDelete, depth }: {
  node: Extract<TreeNode, { kind: "folder" }>;
  currentPath: string | null;
  onSelect: (p: string) => void;
  onDelete: (p: string) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-2 py-1 hover:bg-gray-100 rounded flex items-center gap-1"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <span className="text-gray-400 w-3">{open ? "▾" : "▸"}</span>
        <span className="truncate">{node.name}</span>
      </button>
      {open && (
        <FilesTree
          nodes={node.children}
          currentPath={currentPath}
          onSelect={onSelect}
          onDelete={onDelete}
          depth={depth + 1}
        />
      )}
    </li>
  );
}
