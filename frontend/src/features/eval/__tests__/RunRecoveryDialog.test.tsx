import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RunRecoveryDialog } from "../components/RunRecoveryDialog";

const run = { run_id: "finance", collection_id: "finance", done: 45, total: 150 };

describe("RunRecoveryDialog", () => {
  it("shows the collection and the done/total progress", () => {
    render(<RunRecoveryDialog run={run} onResume={() => {}} onDiscard={() => {}} onDismiss={() => {}} />);
    const dlg = screen.getByTestId("run-recovery-dialog");
    expect(dlg).toHaveTextContent("finance");
    expect(dlg).toHaveTextContent("45/150");
  });

  it("Resume / Discard call their handlers; the backdrop dismisses (keeps the log)", () => {
    const onResume = vi.fn();
    const onDiscard = vi.fn();
    const onDismiss = vi.fn();
    render(<RunRecoveryDialog run={run} onResume={onResume} onDiscard={onDiscard} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId("recovery-resume"));
    expect(onResume).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("recovery-discard"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("run-recovery-dialog")); // backdrop
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
