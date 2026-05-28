import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { FilesTree } from "../FilesTree";
import type { TreeNode } from "../../../../shared/ipc/workspaces";

const nodes: TreeNode[] = [
  {
    kind: "folder", name: "drafts", path: "/ws/drafts",
    children: [{ kind: "file", name: "k.quantamind.yaml", path: "/ws/drafts/k.quantamind.yaml" }],
  },
  { kind: "file", name: "top.quantamind.yaml", path: "/ws/top.quantamind.yaml" },
];

describe("FilesTree", () => {
  it("renders folders and files with the extension stripped", () => {
    render(<FilesTree nodes={nodes} currentPath={null} onSelect={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("drafts")).toBeTruthy();
    expect(screen.getByText("top")).toBeTruthy();
    expect(screen.getByText("k")).toBeTruthy();
  });

  it("calls onSelect with the file path", () => {
    const onSelect = vi.fn();
    render(<FilesTree nodes={nodes} currentPath={null} onSelect={onSelect} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByText("top"));
    expect(onSelect).toHaveBeenCalledWith("/ws/top.quantamind.yaml");
  });

  it("collapsing a folder hides its children", () => {
    render(<FilesTree nodes={nodes} currentPath={null} onSelect={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText("k")).toBeTruthy();
    fireEvent.click(screen.getByText("drafts"));
    expect(screen.queryByText("k")).toBeNull();
  });

  it("delete button calls onDelete with the path", () => {
    const onDelete = vi.fn();
    render(<FilesTree nodes={nodes} currentPath={null} onSelect={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText("Delete top"));
    expect(onDelete).toHaveBeenCalledWith("/ws/top.quantamind.yaml");
  });

  it("highlights the active file", () => {
    render(
      <FilesTree
        nodes={nodes}
        currentPath="/ws/top.quantamind.yaml"
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const li = screen.getByText("top").closest("li") as HTMLElement;
    expect(within(li).getByText("top").className).toContain("text-blue-700");
  });
});
