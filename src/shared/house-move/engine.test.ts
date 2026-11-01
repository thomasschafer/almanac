import { describe, expect, it } from "vitest";
import { fromPounds as pounds } from "../money.ts";
import { percent, signedPercent } from "../rates.ts";
import { calculateHouseMove } from "./engine.ts";
import type { HouseMoveInputs } from "./inputs.ts";
import { maximumInputs, testInputs, today } from "./test-inputs.ts";

const calculate = (input: HouseMoveInputs) => calculateHouseMove(input, today);

function row(input: HouseMoveInputs, index = 0) {
  const value = calculate(input).series[index];
  if (value === undefined) throw new Error("Missing test month");
  return value;
}

function upfront(input: HouseMoveInputs) {
  input.costs = [
    {
      id: "survey",
      name: "Survey",
      amount: { kind: "fixed", amount: pounds(200) },
      plusVat: false,
      timing: "upfront",
    },
  ];
}

describe("house-move calculation", () => {
  it("finds the first affordable month with the post-payment mortgage balance", () => {
    const result = calculate(testInputs());
    // £1,000 sale - (£1,200 - 12 × £100) mortgage = £1,000 deposit.
    expect(result.result).toEqual({
      kind: "future",
      month: "2027-11",
      years: 1,
      months: 0,
      monthsFromToday: 12,
    });
    expect(result.breakdown).toMatchObject({
      mortgageBalance: 0,
      available: pounds(1000),
      needed: pounds(1000),
      leftOver: 0,
    });
    expect(result.series).toHaveLength(61);
  });

  it("returns now and starts at today's state when the balance is from an earlier month", () => {
    const input = testInputs();
    input.asOf = "2025-11";
    expect(calculate(input).result).toEqual({ kind: "now", month: today });
    expect(calculate(input).series[0]?.mortgageBalance).toBe(0);
    input.asOf = "2026-12";
    expect(() => calculate(input)).toThrow("after today");
  });

  it("adds VAT to each selected cost and includes buying tax once at completion", () => {
    const input = testInputs();
    input.homeValue = pounds(300000);
    input.targetPrice = pounds(450000);
    input.mortgage.balance = pounds(150000);
    input.costs = [
      {
        id: "agent",
        name: "Agent",
        amount: { kind: "sale-percent", rate: percent(1.25) },
        plusVat: true,
        timing: "completion",
      },
      {
        id: "purchase",
        name: "Purchase",
        amount: { kind: "purchase-percent", rate: percent(1) },
        plusVat: false,
        timing: "completion",
      },
      {
        id: "survey",
        name: "Survey",
        amount: { kind: "fixed", amount: pounds(100) },
        plusVat: true,
        timing: "upfront",
      },
    ];
    const breakdown = row(input);
    expect(breakdown.costs[0]).toMatchObject({
      net: pounds(3750),
      vat: pounds(750),
      total: pounds(4500),
    });
    expect(breakdown.completionCosts).toBe(pounds(9000));
    expect(breakdown.buyingTax).toBe(pounds(12500));
    expect(breakdown.equityLeft).toBe(pounds(128500));
    expect(breakdown.deposit).toBe(pounds(45000));
    expect(breakdown.leftOver).toBe(pounds(83500));
    expect(breakdown.upfrontShortfall).toBe(pounds(120));
    input.region = "scotland";
    expect(row(input).buyingTax).toBe(pounds(18350));
  });

  it("does not delay the date for an up-front cash shortfall, but only adds cash left after costs", () => {
    const input = testInputs();
    input.mortgage.balance = pounds(0);
    upfront(input);
    input.cash.savings = pounds(100);
    const short = calculate(input);
    expect(short.result.kind).toBe("now");
    expect(short.breakdown).toMatchObject({
      upfrontCosts: pounds(200),
      upfrontShortfall: pounds(100),
      savingsLeft: 0,
      leftOver: 0,
    });
    input.cash.savings = pounds(300);
    expect(calculate(input).breakdown).toMatchObject({
      upfrontShortfall: 0,
      savingsLeft: pounds(100),
      leftOver: pounds(100),
    });
  });

  it("adds savings after monthly interest and uses the annual-equivalent rate", () => {
    const input = testInputs();
    input.cash = { savings: pounds(100), monthlySaving: pounds(10), interestRate: percent(12.68) };
    // £100 × (1.1268)^(1/12) = £100.99963 -> £101.00, then £10 added.
    expect(row(input, 1).savings).toBe(pounds(111));
    // £111 × (1.1268)^(1/12) -> £112.11, then £10.
    expect(row(input, 2).savings).toBe(pounds(122.11));
  });

  it("indexes prices, fixed costs and deposits independently and reports real equivalents", () => {
    const input = testInputs();
    input.growth = {
      home: signedPercent(10),
      target: signedPercent(20),
      inflation: signedPercent(5),
    };
    input.deposit = { kind: "amount", amount: pounds(1000) };
    upfront(input);
    const annual = row(input, 12);
    expect(annual.salePrice).toBe(pounds(1100));
    expect(annual.targetPrice).toBe(pounds(12000));
    expect(annual.deposit).toBe(pounds(1050));
    expect(annual.upfrontCosts).toBe(pounds(210));
    expect(annual.todaysMoney.deposit).toBe(pounds(1000));
    expect(annual.todaysMoney.upfrontCosts).toBe(pounds(200));
  });

  it("applies ERC through its stated month and its expiry changes the result date", () => {
    const input = testInputs();
    input.homeValue = pounds(2100);
    input.mortgage.paymentOverride = pounds(0);
    input.mortgage.ercBands = [{ until: "2027-01", rate: percent(10) }];
    input.mortgage.exitFee = pounds(50);
    // £2,100 - £1,200 - £120 ERC - £50 exit = £730. Without ERC: £850.
    input.deposit = { kind: "amount", amount: pounds(800) };
    expect(calculate(input).result).toMatchObject({
      kind: "future",
      month: "2027-02",
      monthsFromToday: 3,
    });
    expect(row(input, 2).earlyRepaymentCharge).toBe(pounds(120));
    expect(row(input, 3).earlyRepaymentCharge).toBe(0);
    input.mortgage.ercBands = [];
    expect(calculate(input).result.kind).toBe("now");
  });

  it("makes the borrowing check bind even with sufficient equity", () => {
    const input = testInputs();
    input.mortgage.balance = pounds(0);
    input.targetPrice = pounds(5500);
    input.borrowingCheck = {
      annualIncome: pounds(1000),
      incomeGrowth: signedPercent(10),
      multiple: 4.5,
    };
    const result = calculate(input);
    expect(result.result).toMatchObject({ kind: "future", month: "2027-11", monthsFromToday: 12 });
    expect(result.series[0]?.borrowing).toEqual({
      income: pounds(1000),
      maximum: pounds(4500),
      sufficient: false,
    });
    expect(result.breakdown?.borrowing).toEqual({
      income: pounds(1100),
      maximum: pounds(4950),
      sufficient: true,
    });
    input.borrowingCheck = null;
    expect(calculate(input).result.kind).toBe("now");
  });

  it("calculates every maximum input at maximum growth over the full 40 years", () => {
    for (const region of ["england-ni", "scotland"] as const) {
      const input = maximumInputs();
      input.region = region;
      const result = calculate(input);
      // The engine calculates the full horizon even when the returned chart ends sooner.
      expect(result.series.length).toBeGreaterThanOrEqual(61);
      for (const row of result.series) {
        for (const value of Object.values(row.todaysMoney))
          expect(Number.isSafeInteger(value)).toBe(true);
      }
    }
  });

  it("keeps the engine's defensive failure for an override below interest", () => {
    const input = testInputs();
    input.mortgage.rate = percent(12);
    input.mortgage.paymentOverride = pounds(1);
    expect(() => calculate(input)).toThrow("cover interest");
  });

  it("projects a full 40 years from today when the figures are older", () => {
    const input = testInputs();
    input.asOf = "2025-11";
    input.homeValue = pounds(999);
    const result = calculate(input);
    expect(result.result.kind).toBe("not-within-40-years");
    expect(result.series).toHaveLength(481);
    expect(result.series[0]?.month).toBe(today);
    expect(result.series.at(-1)?.month).toBe("2066-11");
    // 12 historical payments plus 480 future payments reach the deposit exactly.
    input.homeValue = pounds(1000);
    input.mortgage.remainingMonths = 492;
    const affordable = calculate(input);
    expect(affordable.result).toMatchObject({
      kind: "future",
      month: "2066-11",
      monthsFromToday: 480,
    });
    expect(affordable.series).toHaveLength(481);
  });

  it("returns not within 40 years when equity can never cover the deposit", () => {
    const input = testInputs();
    input.homeValue = pounds(999);
    expect(calculate(input).result).toEqual({ kind: "not-within-40-years" });
    expect(calculate(input).breakdown).toBeNull();
    expect(calculate(input).series).toHaveLength(481);
    expect(calculate(input).warnings).toContainEqual({ kind: "buying-tax-assumed-unchanged" });
  });

  it("can be overtaken by a faster-growing target", () => {
    const input = testInputs();
    input.growth.target = signedPercent(10);
    expect(calculate(input).result.kind).toBe("not-within-40-years");
    expect(calculate(testInputs()).result.kind).toBe("future");
  });

  it("supports negative growth", () => {
    const input = testInputs();
    input.growth = {
      home: signedPercent(-10),
      target: signedPercent(-20),
      inflation: signedPercent(-5),
    };
    upfront(input);
    const annual = row(input, 12);
    expect(annual.salePrice).toBe(pounds(900));
    expect(annual.targetPrice).toBe(pounds(8000));
    expect(annual.deposit).toBe(pounds(800));
    expect(annual.upfrontCosts).toBe(pounds(190));
    expect(calculate(input).result.kind).toBe("future");
  });

  it("caps a fixed deposit above the price, leaving a zero new mortgage", () => {
    const input = testInputs();
    input.deposit = { kind: "amount", amount: pounds(20000) };
    input.homeValue = pounds(10000);
    input.mortgage.balance = pounds(0);
    const result = calculate(input);
    expect(result.result.kind).toBe("now");
    expect(result.breakdown).toMatchObject({ deposit: pounds(10000), newMortgage: 0, leftOver: 0 });
  });

  it("extends the chart two years past the result and respects the 40-year limit", () => {
    const input = testInputs();
    input.mortgage.remainingMonths = 120;
    const result = calculate(input);
    expect(result.result).toMatchObject({ monthsFromToday: 120 });
    expect(result.series).toHaveLength(145);
    input.mortgage.remainingMonths = 480;
    const limit = calculate(input);
    expect(limit.result).toMatchObject({ monthsFromToday: 480 });
    expect(limit.series).toHaveLength(481);
  });
});
