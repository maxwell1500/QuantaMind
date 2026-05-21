import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@monaco-editor/react", () => ({
  default: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange?: (v: string) => void;
  }) => (
    <textarea
      data-testid="monaco-mock"
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

import { PromptEditor } from "../components/PromptEditor";

function Controlled({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <PromptEditor value={v} onChange={setV} />
      <div data-testid="echo">{v}</div>
    </>
  );
}

describe("PromptEditor", () => {
  it("renders the editor wrapper and the Monaco instance", () => {
    render(<PromptEditor value="" onChange={() => {}} />);
    expect(screen.getByTestId("prompt-editor")).toBeInTheDocument();
    expect(screen.getByTestId("monaco-mock")).toBeInTheDocument();
  });

  it("reflects typed text into controlled state", () => {
    render(<Controlled />);
    const textarea = screen.getByTestId("monaco-mock") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Why is the sky blue?" } });
    expect(screen.getByTestId("echo")).toHaveTextContent("Why is the sky blue?");
    expect(textarea.value).toBe("Why is the sky blue?");
  });

  it("accepts initial value via the value prop", () => {
    render(<PromptEditor value="seeded" onChange={() => {}} />);
    expect(
      (screen.getByTestId("monaco-mock") as HTMLTextAreaElement).value,
    ).toBe("seeded");
  });
});
