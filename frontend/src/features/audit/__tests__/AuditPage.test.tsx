import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuditPage } from "../components/AuditPage";

describe("AuditPage", () => {
  it("renders the Audit shell placeholder", () => {
    render(<AuditPage />);
    expect(screen.getByTestId("tab-audit")).toBeInTheDocument();
    expect(screen.getByTestId("audit-empty")).toBeInTheDocument();
  });
});
