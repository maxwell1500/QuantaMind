import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { DatasetBar } from "../components/DatasetBar";
import { useEvalRegistryStore } from "../state/evalRegistryStore";

const presets = [
  { id: "curated", label: "Curated Suite" },
  { id: "finance", label: "Finance (preset)" },
];

beforeEach(() => {
  vi.clearAllMocks();
  useEvalRegistryStore.setState({ presets, collections: ["mine"], selected: "curated", tasks: [] });
});

describe("DatasetBar", () => {
  it("lists built-in presets and customs; presets are read-only (no edit/delete)", () => {
    render(<DatasetBar />);
    expect(screen.getByRole("option", { name: "Finance (preset)" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "mine" })).toBeTruthy();
    expect(screen.queryByTestId("dataset-edit")).toBeNull();
    expect(screen.queryByTestId("dataset-delete")).toBeNull();
  });

  it("offers edit/delete only for a selected custom collection", () => {
    useEvalRegistryStore.setState({ selected: "mine" });
    render(<DatasetBar />);
    expect(screen.getByTestId("dataset-edit")).toBeTruthy();
    expect(screen.getByTestId("dataset-delete")).toBeTruthy();
  });
});
