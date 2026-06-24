import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { ModelTemperaturePopover } from "../components/model-select/ModelTemperaturePopover";
import { useModelSettingsStore } from "../../models/state/modelSettingsStore";

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue(undefined);
  useModelSettingsStore.setState({ byModel: {}, loaded: true });
});

describe("ModelTemperaturePopover", () => {
  it("disables the gear when no model is selected", () => {
    render(<ModelTemperaturePopover modelName={null} />);
    expect(screen.getByTestId("model-temperature-button")).toBeDisabled();
    expect(screen.queryByTestId("model-temperature-popover")).toBeNull();
  });

  it("shows the default 0.70 when no setting is persisted yet", () => {
    render(<ModelTemperaturePopover modelName="llama3" />);
    fireEvent.click(screen.getByTestId("model-temperature-button"));
    expect(screen.getByTestId("model-temperature-popover")).toBeInTheDocument();
    expect(screen.getByTestId("model-temperature-value")).toHaveTextContent("0.70");
  });

  it("reflects the persisted temperature for the active model", () => {
    useModelSettingsStore.setState({
      byModel: { llama3: { temperature: 1.4 } }, loaded: true,
    });
    render(<ModelTemperaturePopover modelName="llama3" />);
    fireEvent.click(screen.getByTestId("model-temperature-button"));
    expect(screen.getByTestId("model-temperature-value")).toHaveTextContent("1.40");
  });

  it("commits a new value on slider release via set_model_temperature", () => {
    render(<ModelTemperaturePopover modelName="llama3" />);
    fireEvent.click(screen.getByTestId("model-temperature-button"));
    const slider = screen.getByLabelText("Temperature") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "1.25" } });
    fireEvent.pointerUp(slider);
    expect(invoke).toHaveBeenCalledWith("set_model_temperature", {
      model: "llama3", temperature: 1.25,
    });
  });

  it("Reset restores 0.7", () => {
    useModelSettingsStore.setState({
      byModel: { llama3: { temperature: 1.4 } }, loaded: true,
    });
    render(<ModelTemperaturePopover modelName="llama3" />);
    fireEvent.click(screen.getByTestId("model-temperature-button"));
    fireEvent.click(screen.getByTestId("model-temperature-reset"));
    expect(invoke).toHaveBeenCalledWith("set_model_temperature", {
      model: "llama3", temperature: 0.7,
    });
  });

  it("closes when Escape is pressed", () => {
    render(<ModelTemperaturePopover modelName="llama3" />);
    fireEvent.click(screen.getByTestId("model-temperature-button"));
    expect(screen.getByTestId("model-temperature-popover")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("model-temperature-popover")).toBeNull();
  });
});
