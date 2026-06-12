import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditProfileModal } from "../components/EditProfileModal";
import type { ReadinessProfile } from "../../../shared/ipc/eval/readiness";

const profile: ReadinessProfile = {
  id: "coding-agent",
  name: "Coding agent",
  min_pass_k: 0.8,
  max_avg_steps: null,
  max_ms_per_step: null,
  min_context_tokens: null,
  forbid_infinite_loop: true,
  forbid_hallucinated_completion: true,
  require_full_vram: true,
  require_native_fc: false,
};

describe("EditProfileModal", () => {
  it("prefills the active profile and saves edited thresholds back as a real profile", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<EditProfileModal profile={profile} onSave={onSave} onClose={onClose} />);

    // Min Pass^k is shown as a percent (0.8 → 80) and edited to 90%.
    const passk = screen.getByTestId("edit-profile-minpassk") as HTMLInputElement;
    expect(passk.value).toBe("80");
    fireEvent.change(passk, { target: { value: "90" } });

    fireEvent.click(screen.getByTestId("edit-profile-save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    const saved = onSave.mock.calls[0][0] as ReadinessProfile;
    expect(saved.id).toBe("coding-agent"); // id preserved
    expect(saved.min_pass_k).toBeCloseTo(0.9); // percent → fraction
    expect(saved.require_full_vram).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  it("treats a blank soft-target field as 'off' (null), never 0", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditProfileModal profile={profile} onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId("edit-profile-save"));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].max_avg_steps).toBeNull();
  });
});
