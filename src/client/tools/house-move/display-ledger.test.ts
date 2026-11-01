import { describe, expect, it } from "vitest";
import { defaultHouseMoveInputs } from "../../../shared/house-move/defaults.ts";
import { calculateHouseMove } from "../../../shared/house-move/engine.ts";
import type { MonthBreakdown } from "../../../shared/house-move/result.ts";
import { asPence, fromPounds } from "../../../shared/money.ts";
import { percent, signedPercent } from "../../../shared/rates.ts";
import { displayLedger } from "./display-ledger.ts";

function reconcile(row: MonthBreakdown) {
  const exact: Readonly<Record<string, number>> = {
    equityFromSale: row.equityFromSale,
    moneyAtCompletion: row.moneyAtCompletion,
    leftForDeposit: row.leftForDeposit,
    leftOver: row.leftOver,
    targetPrice: row.targetPrice,
  };
  const exactReal: Readonly<Record<string, number>> = row.todaysMoney;
  const ledger = displayLedger(row);
  for (const entries of [ledger.move, ledger.purchase]) {
    let nominal = 0;
    let real = 0;
    let leaves = 0;
    for (const entry of entries) {
      expect(Number.isInteger(entry.value / 100)).toBe(true);
      expect(Number.isInteger(entry.todaysMoney / 100)).toBe(true);
      if (entry.operation === "=") {
        expect(entry.value).toBe(nominal);
        expect(entry.todaysMoney).toBe(real);
        const expected = exact[entry.field];
        const expectedReal = exactReal[entry.field];
        if (expected === undefined || expectedReal === undefined)
          throw new Error(`No exact subtotal for ${entry.field}`);
        // Even converted leaf values are rounded to pence first; £1 per leaf bounds both stages.
        expect(Math.abs(entry.value - expected)).toBeLessThanOrEqual(leaves * 100);
        expect(Math.abs(entry.todaysMoney - expectedReal)).toBeLessThanOrEqual(leaves * 100);
      } else {
        nominal += entry.value;
        real += entry.todaysMoney;
        leaves++;
        if (entry.operation === "+") {
          expect(entry.value).toBeGreaterThanOrEqual(0);
          expect(entry.todaysMoney).toBeGreaterThanOrEqual(0);
        } else {
          expect(entry.value).toBeLessThanOrEqual(0);
          expect(entry.todaysMoney).toBeLessThanOrEqual(0);
        }
      }
    }
  }
}

describe("displayLedger", () => {
  it("rounds leaves, including half-pound expenses, and derives totals instead of rounding them", () => {
    const inputs = defaultHouseMoveInputs("2026-11");
    inputs.homeValue = fromPounds(300000.49);
    inputs.mortgage.balance = fromPounds(150000.5);
    inputs.mortgage.ercBands = [{ until: "2027-11", rate: percent(1.5) }];
    inputs.mortgage.exitFee = fromPounds(125.5);
    inputs.cash.savings = fromPounds(7000.77);
    inputs.targetPrice = fromPounds(450000.5);
    inputs.costs = inputs.costs.map((cost) =>
      cost.id === "arrangement"
        ? { ...cost, amount: { kind: "fixed", amount: fromPounds(999.21) } }
        : cost,
    );
    const row = calculateHouseMove(inputs, "2026-11").series[0];
    if (row === undefined) throw new Error("Missing month zero");
    const original = structuredClone(row);
    const ledger = displayLedger(row);
    const amounts = Object.fromEntries(ledger.move.map((entry) => [entry.field, entry.value]));
    expect(amounts).toMatchObject({
      salePrice: fromPounds(300000),
      mortgageBalance: fromPounds(-150001),
      equityFromSale: fromPounds(147623),
      moneyAtCompletion: fromPounds(151434),
      leftForDeposit: fromPounds(129935),
      leftOver: fromPounds(17435),
    });
    expect(ledger.purchase.at(-1)?.value).toBe(fromPounds(450000));
    expect(row).toEqual(original);
    reconcile(row);
  });

  it("reconciles both columns and the purchase equation within £1 per leaf across projected months", () => {
    let shortfalls = 0;
    let affordable = 0;
    for (let seed = 0; seed < 24; seed++) {
      const inputs = defaultHouseMoveInputs("2026-11");
      inputs.homeValue = fromPounds(200000.49);
      inputs.mortgage.balance = asPence(fromPounds(150000.5) + seed);
      inputs.mortgage.exitFee = fromPounds(125.5);
      inputs.mortgage.ercBands = [{ until: "2027-11", rate: percent(1.5) }];
      inputs.cash = {
        savings: fromPounds(7000.49),
        monthlySaving: fromPounds(100.5),
        interestRate: percent(2.5),
      };
      inputs.growth = {
        home: signedPercent(seed % 2 === 0 ? 0 : 3),
        target: signedPercent(1),
        inflation: signedPercent(seed % 3 === 0 ? -2 : 2.5),
      };
      inputs.deposit =
        seed % 2 === 0
          ? { kind: "percent", rate: percent(25) }
          : { kind: "amount", amount: fromPounds(100000.5) };
      inputs.costs = inputs.costs.map((cost) =>
        cost.amount.kind === "fixed"
          ? { ...cost, amount: { ...cost.amount, amount: asPence(cost.amount.amount + 49 + seed) } }
          : cost,
      );
      for (const row of calculateHouseMove(inputs, "2026-11").series) {
        reconcile(row);
        if (row.leftOver < 0) shortfalls++;
        if (row.affordable) affordable++;
      }
    }
    expect(shortfalls).toBeGreaterThan(0);
    expect(affordable).toBeGreaterThan(0);
  });
});
