import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { FeedbackModal } from "../components/FeedbackModal";
import { useWorkspaceStore } from "../../workspace/state/workspaceStore";

const onClose = vi.fn();

beforeEach(() => {
  vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
  onClose.mockReset();
  useWorkspaceStore.setState({ selectedModel: null });
});

const renderModal = () => render(<FeedbackModal onClose={onClose} />);

describe("FeedbackModal", () => {
  it("Send is disabled until message is at least 10 chars (trimmed)", () => {
    renderModal();
    const send = screen.getByTestId("feedback-send");
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByTestId("feedback-message"), {
      target: { value: "   short   " },
    });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByTestId("feedback-message"), {
      target: { value: "this is a real complaint" },
    });
    expect(send).toBeEnabled();
  });

  it("submits valid message with no email and closes the modal", async () => {
    renderModal();
    fireEvent.change(screen.getByTestId("feedback-message"), {
      target: { value: "the search is sluggish on big repos" },
    });
    fireEvent.click(screen.getByTestId("feedback-send"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("submit_feedback", expect.objectContaining({
        message: "the search is sluggish on big repos",
        userEmail: null,
        includeDiagnostics: false,
        currentModel: null,
      })),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("includes diagnostics payload + current model when checkbox is on", async () => {
    useWorkspaceStore.setState({ selectedModel: "mistral:7b" });
    renderModal();
    fireEvent.change(screen.getByTestId("feedback-message"), {
      target: { value: "ten chars min satisfied" },
    });
    fireEvent.click(screen.getByTestId("feedback-diagnostics"));
    fireEvent.click(screen.getByTestId("feedback-send"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("submit_feedback", expect.objectContaining({
        includeDiagnostics: true, currentModel: "mistral:7b",
      })),
    );
  });

  it("passes the email through to the IPC when provided", async () => {
    renderModal();
    fireEvent.change(screen.getByTestId("feedback-message"), {
      target: { value: "ten chars min satisfied" },
    });
    fireEvent.change(screen.getByTestId("feedback-email"), {
      target: { value: " someone@example.com " },
    });
    fireEvent.click(screen.getByTestId("feedback-send"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("submit_feedback", expect.objectContaining({
        userEmail: "someone@example.com",
      })),
    );
  });

  it("surfaces backend error inline and keeps the modal open", async () => {
    vi.mocked(invoke).mockRejectedValue({ kind: "inference", message: "Web3Forms HTTP 503" });
    renderModal();
    fireEvent.change(screen.getByTestId("feedback-message"), {
      target: { value: "ten chars min satisfied" },
    });
    fireEvent.click(screen.getByTestId("feedback-send"));
    await waitFor(() =>
      expect(screen.getByTestId("feedback-error")).toHaveTextContent(/Web3Forms HTTP 503/),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Cancel closes without invoking the IPC", () => {
    renderModal();
    fireEvent.click(screen.getByTestId("feedback-cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("Escape closes the modal", () => {
    renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
