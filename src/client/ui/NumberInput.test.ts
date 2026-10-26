import { describe, expect, it } from "vitest";
import { z } from "zod";
import { boundsOf, percentFormat, poundsFormat } from "./NumberInput.tsx";

describe("percentages", () => {
  const growth = percentFormat({ min: -20, max: 50 });
  const pension = percentFormat({ min: 0, max: 100 });

  it("take a minus sign where they can be negative", () => {
    expect(growth.parse("-2")).toBe(-2);
    expect(growth.parse("-2.5%")).toBe(-2.5);
    expect(growth.parse("−1")).toBe(-1);
    expect(growth.parse("3")).toBe(3);
    expect(growth.negative).toBe(true);
  });

  it("aren't anything yet while only a minus sign is typed", () => {
    expect(growth.parse("-")).toBeNull();
    expect(growth.parse("-.")).toBeNull();
  });

  it("stay within their bounds", () => {
    expect(growth.parse("-20")).toBe(-20);
    expect(growth.parse("-21")).toBeNull();
    expect(growth.parse("51")).toBeNull();
  });

  it("refuse a minus sign where they can't be negative", () => {
    expect(pension.parse("-2")).toBeNull();
    expect(pension.parse("5")).toBe(5);
    expect(pension.negative).toBe(false);
  });

  it("say what they take", () => {
    expect(growth.expects).toBe("Enter a percentage from -20 to 50");
  });

  it("refuse bounds the wrong way round", () => {
    expect(() => percentFormat({ min: 10, max: 0 })).toThrow();
  });
});

describe("bounds from a schema", () => {
  it("are the schema's minimum and maximum", () => {
    expect(boundsOf(z.number().min(-10).max(30))).toEqual({ min: -10, max: 30 });
  });

  it("must both be set", () => {
    expect(() => boundsOf(z.number().min(0))).toThrow();
    expect(() => boundsOf(z.number().max(10))).toThrow();
  });
});

describe("pounds", () => {
  it("are never negative", () => {
    expect(poundsFormat.parse("-100")).toBeNull();
    expect(poundsFormat.parse("£1,250.50")).toBe(125_050);
  });
});
