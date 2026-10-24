import { describe, expect, it } from "vitest";
import { fromPounds as pounds, type Pence } from "../money.ts";
import { calculateTakeHome } from "./engine.ts";
import type { PayBreakdown, TakeHomeCalculation } from "./result.ts";
import { rules2026To27 } from "./rules/2026-27.ts";
import { testInputs, type TestInputs } from "./test-inputs.ts";

function calculate(overrides: TestInputs): TakeHomeCalculation {
  const result = calculateTakeHome(testInputs(overrides), rules2026To27);
  if (result.status !== "ok") {
    throw new Error(JSON.stringify(result.issues));
  }
  return result;
}

function takenFromPay(breakdown: PayBreakdown): Pence {
  switch (breakdown.pension.method) {
    case "salary-sacrifice":
    case "net-pay":
      return breakdown.pension.employee;
    case "relief-at-source":
      return breakdown.pension.paidFromNetPay;
  }
}

const scenarios: readonly TestInputs[] = [
  { salary: 0 },
  { salary: 18_000, loans: ["plan1"] },
  {
    salary: 45_000,
    bonus: 5_000,
    bonusMonth: 3,
    fromSalary: { percent: 5 },
    loans: ["plan2", "postgraduate"],
  },
  { salary: 75_000, method: "net-pay", fromSalary: { percent: 8 }, employer: { percent: 5 } },
  {
    salary: 95_000,
    bonus: 25_000,
    method: "relief-at-source",
    fromSalary: { percent: 6 },
    fromBonus: { percent: 10 },
  },
  {
    salary: 140_000,
    bonus: 60_000,
    bonusMonth: 9,
    fromSalary: { annual: 25_000 },
    employer: { percent: 8 },
    niPassOnPercent: 50,
    loans: ["plan2"],
  },
  { salary: 60_000, region: "scotland", bonus: 10_000, loans: ["plan4"] },
  { salary: 40_000, bonus: 30_000, bonusMonth: 2, taxCode: "1257L M1" },
  { salary: 20_000, taxCode: "K800", loans: ["plan5"] },
];

describe.each(scenarios)("invariants for %j", (scenario) => {
  const result = calculate(scenario);

  it("has 12 months that add up to the year", () => {
    expect(result.months.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const total = (pick: (m: PayBreakdown) => number) =>
      result.months.reduce((sum, m) => sum + pick(m), 0);
    for (const key of [
      "salary",
      "bonus",
      "grossPay",
      "salarySacrifice",
      "niablePay",
      "taxablePay",
      "incomeTax",
      "nationalInsurance",
      "employerNationalInsurance",
      "studentLoanTotal",
      "netPay",
    ] as const) {
      expect(
        total((m) => m[key]),
        key,
      ).toBe(result.annual[key]);
    }
    expect(total((m) => m.pension.total)).toBe(result.annual.pension.total);
    expect(total((m) => m.pension.employer)).toBe(result.annual.pension.employer);
    expect(result.annual.salary).toBe(testInputs(scenario).salary);
  });

  it("has net pay equal to gross less deductions, each month and for the year", () => {
    for (const breakdown of [...result.months, result.annual]) {
      expect(breakdown.netPay).toBe(
        breakdown.grossPay -
          takenFromPay(breakdown) -
          breakdown.incomeTax -
          breakdown.nationalInsurance -
          breakdown.studentLoanTotal,
      );
      expect(breakdown.studentLoanTotal).toBe(
        breakdown.studentLoans.reduce((sum, loan) => sum + loan.amount, 0),
      );
    }
  });

  it("only takes student loans in whole pounds", () => {
    for (const m of result.months) {
      for (const loan of m.studentLoans) {
        expect(loan.amount % 100).toBe(0);
      }
    }
  });

  it("has a normal month that isn't the bonus month", () => {
    expect(result.normalMonth.isBonusMonth).toBe(false);
  });
});

describe("take-home as salary rises", () => {
  // The allowance taper, NI and student loans all take less than 100% of each extra pound, so
  // take-home never falls as salary rises. That holds with a percentage pension contribution too.
  it.each([
    [{ loans: ["plan2", "postgraduate"] }],
    [{ region: "scotland", fromSalary: { percent: 5 } }],
    [{ method: "relief-at-source", fromSalary: { percent: 5 }, loans: ["plan1"] }],
  ] as const)("never falls (%j)", (options) => {
    let previous = -1;
    for (let salary = 0; salary <= 200_000; salary += 250) {
      const net = calculate({ ...options, salary }).annual.netPay;
      expect(net, `£${String(salary)}`).toBeGreaterThanOrEqual(previous);
      previous = net;
    }
  });
});

describe("the next £1,000", () => {
  it.each([
    [{ salary: 30_000, loans: ["plan2"] }],
    [{ salary: 70_000, bonus: 10_000, loans: ["plan2"], fromSalary: { percent: 5 } }],
    [{ salary: 99_800, bonus: 0, fromSalary: { percent: 4 }, employer: { percent: 5 } }],
    [{ salary: 160_000, bonus: 50_000, method: "net-pay", fromSalary: { percent: 10 } }],
    [
      {
        salary: 45_000,
        bonus: 10_000,
        region: "scotland",
        method: "relief-at-source",
        fromSalary: { percent: 5 },
        employer: { percent: 3 },
      },
    ],
  ] as const)("is the change from working out the year again, for %j", (options) => {
    const base = calculate(options);
    const bonus = "bonus" in options ? options.bonus : 0;
    const again = {
      salary: calculate({ ...options, salary: options.salary + 1_000 }),
      bonus: calculate({ ...options, bonus: bonus + 1_000 }),
    };
    for (const stream of ["salary", "bonus"] as const) {
      const change = base.nextThousand[stream];
      const after = again[stream].annual;
      expect(change.extraPay).toBe(pounds(1_000));
      expect(change.takeHome).toBe(after.netPay - base.annual.netPay);
      expect(change.incomeTax).toBe(after.incomeTax - base.annual.incomeTax);
      expect(change.nationalInsurance).toBe(
        after.nationalInsurance - base.annual.nationalInsurance,
      );
      expect(change.pensionTotal).toBe(after.pension.total - base.annual.pension.total);
      const loans = change.studentLoans.reduce((total, loan) => total + loan.amount, 0);
      expect(
        change.takeHome +
          change.incomeTax +
          change.nationalInsurance +
          loans +
          change.pensionFromPay,
      ).toBe(pounds(1_000));
    }
  });
});
