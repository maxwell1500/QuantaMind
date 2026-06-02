import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { EvalEditor } from "../components/EvalEditor";
import { useEvalRegistryStore } from "../state/evalRegistryStore";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EvalEditor", () => {
  it("blocks Save on invalid JSON (no save, no close)", async () => {
    const save = vi.fn();
    useEvalRegistryStore.setState({ save });
    const onClose = vi.fn();
    render(<EvalEditor initialName="x" initialJson="{ not json" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("eval-editor-save"));
    await waitFor(() => expect(screen.getByTestId("eval-editor-check")).toHaveTextContent("Invalid JSON"));
    expect(save).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("saves a valid collection seeded from the example template", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    useEvalRegistryStore.setState({ save });
    const onClose = vi.fn();
    render(<EvalEditor initialName="my_suite" initialJson="[]" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("eval-editor-example"));
    fireEvent.click(screen.getByTestId("eval-editor-save"));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const [name, tasks] = save.mock.calls[0];
    expect(name).toBe("my_suite");
    expect(tasks).toHaveLength(3);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
