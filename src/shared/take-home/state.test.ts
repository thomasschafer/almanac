import { describe, expect, it } from "vitest";
import { toolSchemas } from "../tools.ts";
import { takeHomeInputs, type TakeHomeInputs } from "./inputs.ts";
import { testInputs } from "./test-inputs.ts";

const schemas = toolSchemas["take-home"];

/** Inputs as saved before Plan 1 and Plan 4 loans said when they were first paid. */
function withoutFirstPaid(inputs: TakeHomeInputs): unknown {
  return {
    ...inputs,
    studentLoans: inputs.studentLoans.map(({ plan, balance, firstRepaymentYear }) => ({
      plan,
      balance,
      firstRepaymentYear,
    })),
  };
}

describe("when a Plan 1 or Plan 4 loan was first paid", () => {
  const inputs = testInputs({
    loans: [
      { plan: "plan1", balance: 8_000, firstRepaymentYear: 2004, firstPaid: "before-cutoff" },
      { plan: "plan2", balance: 30_000, firstRepaymentYear: 2016 },
      { plan: "plan4", balance: 12_000, firstRepaymentYear: 2009, firstPaid: "not-sure" },
    ],
  });
  const asNotSure = {
    ...inputs,
    studentLoans: inputs.studentLoans.map((loan) =>
      "firstPaid" in loan ? { ...loan, firstPaid: "not-sure" } : loan,
    ),
  };

  it("is required for those plans when writing", () => {
    expect(takeHomeInputs.safeParse(inputs).success).toBe(true);
    expect(takeHomeInputs.safeParse(withoutFirstPaid(inputs)).success).toBe(false);
    expect(schemas.preset.safeParse(withoutFirstPaid(inputs)).success).toBe(false);
    expect(
      schemas.state.safeParse({ inputs: withoutFirstPaid(inputs), whatIf: null }).success,
    ).toBe(false);
  });

  it("is refused for the other plans", () => {
    const plan2 = { plan: "plan2", balance: null, firstRepaymentYear: null };
    for (const firstPaid of ["before-cutoff", "not-sure"]) {
      expect(
        takeHomeInputs.safeParse({ ...inputs, studentLoans: [{ ...plan2, firstPaid }] }).success,
      ).toBe(false);
    }
  });

  it("is read as not sure from state and presets saved without it", () => {
    const old = withoutFirstPaid(inputs);
    expect(schemas.storedPreset.parse(old)).toEqual(asNotSure);
    expect(schemas.storedState.parse(old)).toEqual({ inputs: asNotSure, whatIf: null });
    expect(
      schemas.storedState.parse({ inputs: old, whatIf: { label: "Offer", inputs: old } }),
    ).toEqual({ inputs: asNotSure, whatIf: { label: "Offer", inputs: asNotSure } });
  });

  it("is kept when stored in the current shape", () => {
    expect(schemas.storedPreset.parse(inputs)).toEqual(inputs);
    expect(schemas.storedState.parse({ inputs, whatIf: null })).toEqual({ inputs, whatIf: null });
  });

  it("still refuses anything else when reading", () => {
    const [plan1] = inputs.studentLoans;
    expect(
      schemas.storedPreset.safeParse({
        ...inputs,
        studentLoans: [{ ...plan1, firstPaid: "sometime" }],
      }).success,
    ).toBe(false);
    expect(
      schemas.storedPreset.safeParse({ ...inputs, studentLoans: [{ ...plan1, surprise: true }] })
        .success,
    ).toBe(false);
  });
});
