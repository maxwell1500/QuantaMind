import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("../../../shared/ipc/settings/userSettings", () => ({
  getUserSettings: vi.fn().mockResolvedValue({ first_run_complete: false }),
  setUserSettings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../shared/ipc/system/onboarding", () => ({
  RECOMMENDED_MODEL: "llama3.2:1b",
  scaffoldOnboardingWorkspace: vi.fn().mockResolvedValue("/ws"),
  pullModel: vi.fn().mockResolvedValue("pull-1"),
}));

import { OnboardingCoach } from "../components/OnboardingCoach";
import { useOnboardingStore } from "../state/onboardingStore";
import { useWorkspaceStore } from "../../workspace/state/workspaceStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { useNavStore } from "../../../shared/state/navStore";
import { pullModel } from "../../../shared/ipc/system/onboarding";

beforeEach(() => {
  vi.clearAllMocks();
  useOnboardingStore.setState({ complete: false });
  useWorkspaceStore.setState({ ollamaHealthy: true });
  useInstalledModelsStore.setState({ list: [] });
  useNavStore.setState({ topView: "workspace" });
});

describe("OnboardingCoach", () => {
  it("is hidden once onboarding is complete", () => {
    useOnboardingStore.setState({ complete: true });
    render(<OnboardingCoach />);
    expect(screen.queryByTestId("onboarding-coach")).toBeNull();
  });

  it("shows the Ollama step when not healthy", () => {
    useWorkspaceStore.setState({ ollamaHealthy: false });
    render(<OnboardingCoach />);
    expect(screen.getByTestId("onboarding-ollama")).toBeTruthy();
  });

  it("shows the model step and pulls the recommended model", () => {
    render(<OnboardingCoach />);
    expect(screen.getByTestId("onboarding-model")).toBeTruthy();
    fireEvent.click(screen.getByTestId("onboarding-pull"));
    expect(pullModel).toHaveBeenCalledWith("llama3.2:1b");
    expect(useNavStore.getState().topView).toBe("downloads");
  });

  it("shows the ready step and finishes on open", async () => {
    useInstalledModelsStore.setState({ list: [{ name: "llama3.2:1b" }] as never });
    render(<OnboardingCoach />);
    fireEvent.click(screen.getByTestId("onboarding-finish"));
    await waitFor(() => expect(useOnboardingStore.getState().complete).toBe(true));
  });

  it("Skip finishes onboarding", async () => {
    render(<OnboardingCoach />);
    fireEvent.click(screen.getByTestId("onboarding-skip"));
    await waitFor(() => expect(useOnboardingStore.getState().complete).toBe(true));
  });
});
