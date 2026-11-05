import { describe, expect, it } from "vitest";
import { addMonths, tryAddMonths } from "./months.ts";

describe("adding months", () => {
  it("moves across years", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(tryAddMonths("2026-01", -1)).toBe("2025-12");
  });

  it("has no month after year 9999", () => {
    expect(tryAddMonths("9999-12", 1)).toBeNull();
    expect(() => addMonths("9999-12", 12)).toThrow("isn't a real month");
  });
});
