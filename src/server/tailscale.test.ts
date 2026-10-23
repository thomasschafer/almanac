import { describe, expect, it } from "vitest";
import { parseOwnerLogin } from "./tailscale.ts";

describe("parseOwnerLogin", () => {
  it("finds the login of this machine's user", () => {
    const status = JSON.stringify({
      Self: { UserID: 42 },
      User: { "42": { LoginName: "owner@example.com" }, "7": { LoginName: "other@example.com" } },
    });
    expect(parseOwnerLogin(status)).toBe("owner@example.com");
  });

  it("fails if the user isn't listed", () => {
    const status = JSON.stringify({ Self: { UserID: 1 }, User: {} });
    expect(() => parseOwnerLogin(status)).toThrow(/logged in/);
  });
});
