import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { FilesTree } from "../FilesTree";
import type { TreeNode } from "../../../../shared/ipc/workspace/workspaces";

const nodes: TreeNode[] = [
  {
    kind: "folder", name: "drafts", path: "/ws/drafts",
    children: [{ kind: "file", name: "k.quantamind.yaml", path: "/ws/drafts/k.quantamind.yaml" }],
  },
  { kind: "file", name: "top.quantamind.yaml", path: "/ws/top.quantamind.yaml" },
];

const renderTree = (props: Partial<Parameters<typeof FilesTree>[0]> = {}) =>
  render(
    <FilesTree
      nodes={nodes}
      currentPath={null}
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      {...props}
    />,
  );

describe("FilesTree", () => {
  it("renders folders and files with the extension stripped", () => {
    renderTree();
    expect(screen.getByText("drafts")).toBeTruthy();
    expect(screen.getByText("top")).toBeTruthy();
    expect(screen.getByText("k")).toBeTruthy();
  });

  it("calls onSelect with the file path", () => {
    const onSelect = vi.fn();
    renderTree({ onSelect });
    fireEvent.click(screen.getByText("top"));
    expect(onSelect).toHaveBeenCalledWith("/ws/top.quantamind.yaml");
  });

  it("collapsing a folder hides its children", () => {
    renderTree();
    expect(screen.getByText("k")).toBeTruthy();
    fireEvent.click(screen.getByText("drafts"));
    expect(screen.queryByText("k")).toBeNull();
  });

  it("delete button calls onDelete with the path", () => {
    const onDelete = vi.fn();
    renderTree({ onDelete });
    fireEvent.click(screen.getByLabelText("Delete top"));
    expect(onDelete).toHaveBeenCalledWith("/ws/top.quantamind.yaml");
  });

  it("double-click opens an inline editor; Enter calls onRename", () => {
    const onRename = vi.fn();
    renderTree({ onRename });
    fireEvent.doubleClick(screen.getByText("top"));
    const input = screen.getByTestId("file-rename-input-top") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("/ws/top.quantamind.yaml", "renamed");
  });

  it("Escape cancels the rename without calling onRename", () => {
    const onRename = vi.fn();
    renderTree({ onRename });
    fireEvent.doubleClick(screen.getByText("top"));
    fireEvent.keyDown(screen.getByTestId("file-rename-input-top"), { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("top")).toBeTruthy();
  });

  it("highlights the active file", () => {
    renderTree({ currentPath: "/ws/top.quantamind.yaml" });
    const li = screen.getByText("top").closest("li") as HTMLElement;
    expect(within(li).getByText("top").className).toContain("text-blue-700");
  });
});
