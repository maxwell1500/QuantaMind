import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { OutputStream } from "../components/OutputStream";

describe("OutputStream", () => {
  it("renders the streaming output area by default", () => {
    render(<OutputStream output="hello" />);
    expect(screen.getByTestId("output-stream")).toHaveTextContent("hello");
    expect(screen.queryByTestId("output-stream-loading")).toBeNull();
  });

  it("renders the loading placeholder when loading=true and output is empty", () => {
    render(<OutputStream output="" loading />);
    expect(screen.getByTestId("output-stream-loading")).toHaveTextContent(/Loading model/);
    expect(screen.queryByTestId("output-stream")).toBeNull();
  });

  it("loading=true is ignored once tokens start streaming", () => {
    render(<OutputStream output="first token" loading />);
    expect(screen.getByTestId("output-stream")).toHaveTextContent("first token");
    expect(screen.queryByTestId("output-stream-loading")).toBeNull();
  });
});
