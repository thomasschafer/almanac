import { describe, expect, it } from "vitest";
import { percent, signedPercent } from "../rates.ts";
import { houseMoveInputs, storedHouseMoveInputs } from "./inputs.ts";
import { houseMoveInputProblems } from "./problems.ts";
import { houseMoveState, storedHouseMoveState } from "./state.ts";
import { maximumInputs, testInputs, today } from "./test-inputs.ts";

describe("calculation input problems", () => {
  it("keeps previously valid saved state readable as time passes", () => {
    const input = maximumInputs();
    const saved = houseMoveState.parse({ inputs: input });
    expect(houseMoveInputProblems(input, today)).toEqual([]);
    expect(houseMoveInputProblems(input, "2050-11")).toContainEqual(
      expect.objectContaining({ kind: "projection-headroom", path: ["growth", "inflation"] }),
    );
    expect(storedHouseMoveState.parse(saved)).toEqual(saved);
    expect(storedHouseMoveInputs.parse(input)).toEqual(input);
  });

  it("reports future dates without rejecting their stored shape", () => {
    const input = testInputs();
    input.asOf = "2027-01";
    expect(houseMoveInputs.parse(input)).toEqual(input);
    expect(houseMoveInputProblems(input, today)).toContainEqual({
      kind: "as-of-after-today",
      path: ["asOf"],
      message: "As-of month cannot be after today",
    });
  });

  it("returns the override's field path and minimum payment", () => {
    const input = testInputs();
    input.mortgage.rate = percent(12);
    input.mortgage.paymentOverride = input.mortgage.exitFee;
    expect(houseMoveInputProblems(input, today)).toContainEqual(
      expect.objectContaining({
        kind: "payment-below-interest",
        path: ["mortgage", "paymentOverride"],
        minimumPayment: 1200,
      }),
    );
  });

  it("reports a follow-on rate that makes a post-term override insufficient", () => {
    const input = testInputs();
    input.mortgage.paymentOverride = input.mortgage.exitFee;
    input.mortgage.fixedRate = { until: "2028-11", followOnRate: percent(20) };
    expect(houseMoveInputProblems(input, today)).toContainEqual(
      expect.objectContaining({
        kind: "payment-below-interest",
        path: ["mortgage", "paymentOverride"],
        minimumPayment: 2000,
      }),
    );
  });

  it("reports deflation and aggregate-cost headroom problems", () => {
    const input = maximumInputs();
    input.growth.inflation = signedPercent(-20);
    expect(houseMoveInputProblems(input, today).map((p) => p.kind)).toContain(
      "projection-headroom",
    );
    input.growth.inflation = signedPercent(20);
    input.costs = Array.from({ length: 1000 }, (_, i) => ({
      id: String(i),
      name: "Cost",
      amount: { kind: "fixed", amount: input.homeValue },
      timing: "completion",
      plusVat: true,
    }));
    expect(houseMoveInputProblems(input, today).map((p) => p.kind)).toContain(
      "projection-headroom",
    );
    expect(houseMoveInputs.parse(input)).toEqual(input);
  });
});
