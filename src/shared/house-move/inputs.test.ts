import { describe, expect, it } from "vitest";
import { percent, signedPercent } from "../rates.ts";
import { defaultBorrowingCheck, defaultHouseMoveInputs } from "./defaults.ts";
import { month } from "./months.ts";
import { houseMoveInputs, storedHouseMoveInputs } from "./inputs.ts";
import { maximumInputs, testInputs, today } from "./test-inputs.ts";

describe("house-move inputs", () => {
  it("validates strict inputs and stored defaults", () => {
    const input = defaultHouseMoveInputs(today);
    expect(storedHouseMoveInputs.parse(input)).toEqual(input);
    expect(houseMoveInputs.safeParse({ ...input, extra: 1 }).success).toBe(false);
    expect(
      houseMoveInputs.safeParse({ ...input, mortgage: { ...input.mortgage, extra: 1 } }).success,
    ).toBe(false);
    expect(input.costs).toHaveLength(9);
    expect(input.deposit).toEqual({ kind: "percent", rate: percent(25) });
    expect(input.borrowingCheck).toBeNull();
    expect(defaultBorrowingCheck().multiple).toBe(4.5);
    expect(
      houseMoveInputs.parse({ ...input, borrowingCheck: defaultBorrowingCheck() }).borrowingCheck,
    ).toEqual(defaultBorrowingCheck());
  });

  it.each(["2026-00", "2026-13", "2026-1", "0000-01", "2026-02-01", "xxxx-xx"])(
    "rejects invalid month %s",
    (value) => {
      expect(month.safeParse(value).success).toBe(false);
      expect(houseMoveInputs.safeParse({ ...testInputs(), asOf: value }).success).toBe(false);
    },
  );

  it("accepts leap-year February and fractional and signed rates", () => {
    expect(month.parse("2028-02")).toBe("2028-02");
    const input = testInputs();
    input.mortgage.rate = percent(4.59);
    input.growth.home = signedPercent(-3.25);
    expect(houseMoveInputs.parse(input)).toEqual(input);
    expect(() => percent(4.591)).toThrow();
    expect(() => signedPercent(-100)).toThrow();
  });

  it("accepts the upper bounds and rejects values beyond them", () => {
    const input = maximumInputs();
    expect(houseMoveInputs.parse(input)).toEqual(input);
    expect(houseMoveInputs.safeParse({ ...input, homeValue: 10_000_000_001 }).success).toBe(false);
    expect(
      houseMoveInputs.safeParse({ ...input, mortgage: { ...input.mortgage, rate: 2001 } }).success,
    ).toBe(false);
    expect(
      houseMoveInputs.safeParse({ ...input, cash: { ...input.cash, interestRate: 2001 } }).success,
    ).toBe(false);
    expect(
      houseMoveInputs.safeParse({
        ...input,
        borrowingCheck: { ...input.borrowingCheck, multiple: 10.01 },
      }).success,
    ).toBe(false);
    for (const value of [-2001, 2001]) {
      expect(
        houseMoveInputs.safeParse({ ...input, growth: { ...input.growth, home: value } }).success,
      ).toBe(false);
      expect(
        houseMoveInputs.safeParse({ ...input, growth: { ...input.growth, target: value } }).success,
      ).toBe(false);
      expect(
        houseMoveInputs.safeParse({
          ...input,
          growth: { ...input.growth, inflation: value },
        }).success,
      ).toBe(false);
      expect(
        houseMoveInputs.safeParse({
          ...input,
          borrowingCheck: { ...input.borrowingCheck, incomeGrowth: value },
        }).success,
      ).toBe(false);
    }
  });

  it("uses the lower growth bounds when the amounts fit safely", () => {
    const input = testInputs();
    input.growth = {
      home: signedPercent(-20),
      target: signedPercent(-20),
      inflation: signedPercent(-20),
    };
    input.borrowingCheck = {
      annualIncome: input.homeValue,
      incomeGrowth: signedPercent(-20),
      multiple: 10,
    };
    expect(houseMoveInputs.parse(input)).toEqual(input);
  });

  it("rejects invalid combinations and fractional pence", () => {
    const input = testInputs();
    expect(houseMoveInputs.safeParse({ ...input, homeValue: 1.1 }).success).toBe(false);
    expect(
      houseMoveInputs.safeParse({ ...input, deposit: { kind: "percent", rate: 10001 } }).success,
    ).toBe(false);
    expect(
      houseMoveInputs.safeParse({ ...input, growth: { ...input.growth, home: -10000 } }).success,
    ).toBe(false);
    for (const ercBands of [
      [
        { until: "2027-01", rate: 100 },
        { until: "2026-12", rate: 100 },
      ],
      [
        { until: "2027-01", rate: 100 },
        { until: "2027-01", rate: 100 },
      ],
    ])
      expect(
        houseMoveInputs.safeParse({ ...input, mortgage: { ...input.mortgage, ercBands } }).success,
      ).toBe(false);
    expect(
      houseMoveInputs.safeParse({
        ...input,
        mortgage: { ...input.mortgage, oneOffOverpayments: [{ month: today, amount: 100 }] },
      }).success,
    ).toBe(false);
    const cost = defaultHouseMoveInputs(today).costs[0];
    expect(houseMoveInputs.safeParse({ ...input, costs: [cost, cost] }).success).toBe(false);
  });
});
