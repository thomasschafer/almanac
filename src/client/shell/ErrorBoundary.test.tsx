// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary.tsx";

afterEach(cleanup);

function Broken(): never {
  throw new Error("the figures don't add up");
}

describe("ErrorBoundary", () => {
  it("shows its children when nothing fails", () => {
    render(
      <ErrorBoundary>
        <p>Fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Fine")).toBeDefined();
  });

  it("shows the error and a way back when a page fails to render", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeDefined();
    expect(screen.getByText("the figures don't add up")).toBeDefined();
    expect(screen.getByRole("button", { name: "Reload" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Back to Almanac" }).getAttribute("href")).toBe("/");
    expect(logged).toHaveBeenCalledWith(
      "a page failed to render",
      expect.objectContaining({ message: "the figures don't add up" }),
      expect.any(String),
    );
    logged.mockRestore();
  });
});
