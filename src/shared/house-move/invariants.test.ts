import { describe, expect, it } from "vitest";
import { fromPounds as pounds } from "../money.ts";
import { percent, signedPercent } from "../rates.ts";
import { calculateHouseMove } from "./engine.ts";
import type { HouseMoveCalculation } from "./result.ts";
import { testInputs, today } from "./test-inputs.ts";

function wait(result: HouseMoveCalculation): number {
  switch (result.result.kind) {
    case "now":
      return 0;
    case "future":
      return result.result.monthsFromToday;
    case "not-within-40-years":
      return Infinity;
  }
}

describe("house-move invariants", () => {
  it("more externally funded overpayment never makes the date later", () => {
    for (const mode of ["shorten-term", "lower-payment"] as const) {
      let previous = Infinity;
      for (let extra = 0; extra <= 1000; extra += 50) {
        const input = testInputs();
        input.mortgage = {
          ...input.mortgage,
          overpaymentMode: mode,
          rate: percent(4.59),
          monthlyOverpayment: pounds(extra),
        };
        const result = calculateHouseMove(input, today);
        expect(wait(result)).toBeLessThanOrEqual(previous);
        previous = wait(result);
      }
    }
  });

  it("a higher target never makes the date earlier", () => {
    for (const growth of [-3, 0, 3]) {
      let previous = 0;
      for (let price = 5000; price <= 20000; price += 500) {
        const input = testInputs();
        input.growth.target = signedPercent(growth);
        input.targetPrice = pounds(price);
        input.cash.monthlySaving = pounds(10);
        const result = calculateHouseMove(input, today);
        expect(wait(result)).toBeGreaterThanOrEqual(previous);
        previous = wait(result);
      }
    }
  });

  it("every series row reconciles in pence and the chosen result is the first affordable row", () => {
    const input = testInputs();
    input.cash.monthlySaving = pounds(10);
    const result = calculateHouseMove(input, today);
    for (const row of result.series) {
      expect(row.equityLeft).toBe(
        row.salePrice -
          row.mortgageBalance -
          row.earlyRepaymentCharge -
          row.exitFee -
          row.completionCosts -
          row.buyingTax,
      );
      expect(row.available).toBe(row.equityLeft + row.savingsLeft);
      expect(row.leftOver).toBe(row.available - row.needed);
      expect(row.newMortgage + row.deposit).toBe(row.targetPrice);
      expect(row.upfrontShortfall).toBe(Math.max(0, row.upfrontCosts - row.savings));
      expect(row.costs.reduce((sum, cost) => sum + cost.total, 0)).toBe(
        row.completionCosts + row.upfrontCosts,
      );
      for (const amount of Object.values(row.todaysMoney))
        expect(Number.isSafeInteger(amount)).toBe(true);
    }
    expect(result.series.find((row) => row.affordable)).toEqual(result.breakdown);
  });
});
