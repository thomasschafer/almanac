import { describe, expect, it } from "vitest";
import { fromPounds as pounds } from "../money.ts";
import { interestRate, projectStudentLoans, uprate } from "./projection.ts";
import type { LoanProjection, StudentLoanProjection } from "./result.ts";
import { taxYearRegistry } from "./rules/registry.ts";
import { testInputs, type TestInputs } from "./test-inputs.ts";

const start = new Date("2026-10-24T12:00:00Z");

function project(
  overrides: TestInputs,
  from: Date = start,
): Extract<StudentLoanProjection, { status: "ok" }> {
  const result = projectStudentLoans(testInputs(overrides), taxYearRegistry, from);
  if (result.status !== "ok") {
    throw new Error(`expected a projection, got ${JSON.stringify(result)}`);
  }
  return result;
}

function onlyLoan(projection: Extract<StudentLoanProjection, { status: "ok" }>): LoanProjection {
  const [loan] = projection.loans;
  if (loan === undefined || projection.loans.length !== 1) throw new Error("expected one loan");
  return loan;
}

function expectBalanceAddsUp(loan: LoanProjection, opening: number) {
  const closing =
    loan.outcome.kind === "written-off"
      ? loan.outcome.balanceWrittenOff
      : (loan.points.at(-1)?.balance ?? 0);
  expect(pounds(opening) + loan.totalInterest - loan.totalRepaid).toBe(closing);
  const repaid = loan.points.reduce((total, point) => total + point.repaid, 0);
  const interest = loan.points.reduce((total, point) => total + point.interest, 0);
  expect(repaid).toBe(loan.totalRepaid);
  expect(interest).toBe(loan.totalInterest);
}

describe("a high earner's Plan 2 loan", () => {
  const options = {
    salary: 130_000,
    bonus: 40_000,
    fromSalary: { annual: 30_000 },
    employer: { percent: 8 },
    loans: [{ plan: "plan2", balance: 45_000, firstRepaymentYear: 2020 }],
    salaryGrowthPercent: 3,
    rpiPercent: 3,
  } as const;
  const projection = project(options);
  const loan = onlyLoan(projection);

  it("is repaid before it would be written off", () => {
    expect(loan.outcome.kind).toBe("repaid");
    if (loan.outcome.kind === "repaid") {
      expect(loan.outcome.date < "2050-04-06").toBe(true);
    }
    expect(loan.points.at(-1)?.balance).toBe(0);
  });

  it("charts the start and each year end", () => {
    expect(loan.points[0]).toEqual({
      date: "2026-10-24",
      taxYear: "2026-27",
      balance: pounds(45_000),
      repaid: 0,
      interest: 0,
    });
    expect(loan.points[1]?.date).toBe("2027-04-05");
    expect(loan.points.slice(1, -1).every((point) => point.date.endsWith("-04-05"))).toBe(true);
  });

  it("charges the capped 6% in the first year on this income", () => {
    // October 2026 to March 2027: six months at 6% on a falling balance from £45,000.
    const first = loan.points[1];
    expect(first?.interest).toBeGreaterThan(pounds(1_250));
    expect(first?.interest).toBeLessThan(pounds(1_350));
  });

  it("adds up", () => {
    expectBalanceAddsUp(loan, 45_000);
    expect(projection.totalRepaid).toBe(loan.totalRepaid);
    expect(projection.totalInterest).toBe(loan.totalInterest);
  });

  it("repays more once the NI-free sacrifice is capped from April 2029", () => {
    const year = (taxYear: string) =>
      loan.points.find((point) => point.taxYear === taxYear && point.date.endsWith("-04-05"));
    const before = year("2028-29")?.repaid ?? 0;
    const after = year("2029-30")?.repaid ?? 0;
    // About 9% of the £28,000 of sacrifice that becomes NI-able.
    expect(after - before).toBeGreaterThan(pounds(2_400));
  });

  it("lists its assumptions", () => {
    expect(projection.assumptions.some((text) => text.includes("3% a year after 2026-27"))).toBe(
      true,
    );
    expect(projection.assumptions.some((text) => text.includes("6% cap"))).toBe(true);
    expect(projection.assumptions.some((text) => text.includes("April 2029"))).toBe(true);
  });
});

describe("write-off", () => {
  it("writes off a loan that isn't repaid in time", () => {
    const loan = onlyLoan(
      project({
        salary: 32_000,
        loans: [{ plan: "plan2", balance: 60_000, firstRepaymentYear: 2000 }],
      }),
    );
    expect(loan.outcome).toMatchObject({ kind: "written-off", date: "2030-04-06" });
    if (loan.outcome.kind === "written-off") {
      expect(loan.outcome.balanceWrittenOff).toBeGreaterThan(pounds(50_000));
    }
    expect(loan.points.at(-1)?.date).toBe("2030-04-06");
    expectBalanceAddsUp(loan, 60_000);
  });

  it("uses each plan's term", () => {
    // Plan 1 is 25 years and Plan 5 40 years after the April first due.
    const plan1 = onlyLoan(
      project({
        salary: 20_000,
        loans: [{ plan: "plan1", balance: 10_000, firstRepaymentYear: 2010 }],
      }),
    );
    expect(plan1.outcome).toMatchObject({ kind: "written-off", date: "2035-04-06" });
    const plan5 = onlyLoan(
      project({
        salary: 20_000,
        loans: [{ plan: "plan5", balance: 10_000, firstRepaymentYear: 2026 }],
      }),
    );
    expect(plan5.outcome).toMatchObject({ kind: "written-off", date: "2066-04-06" });
  });

  it("reports a loan already past its term as written off", () => {
    const loan = onlyLoan(
      project({
        salary: 50_000,
        loans: [{ plan: "plan2", balance: 5_000, firstRepaymentYear: 1995 }],
      }),
    );
    expect(loan.outcome).toEqual({
      kind: "written-off",
      date: "2025-04-06",
      balanceWrittenOff: pounds(5_000),
    });
    expect(loan.totalRepaid).toBe(0);
  });
});

describe("unknown inputs", () => {
  it("can't project a loan without a balance", () => {
    const loan = onlyLoan(
      project({
        salary: 50_000,
        loans: [{ plan: "plan2", balance: null, firstRepaymentYear: 2020 }],
      }),
    );
    expect(loan.outcome).toEqual({ kind: "unknown", missing: "balance" });
    expect(loan.points).toEqual([]);
  });

  it("still lets a loan without a balance take its share of repayments", () => {
    // On £3,333.33 a month Plan 2 alone repays £79; alongside Plan 1 there's one repayment of
    // £98 above Plan 1's threshold, of which Plan 1 takes £18 and Plan 2 £80.
    const loans = (withPlan1: boolean) => [
      ...(withPlan1 ? [{ plan: "plan1", balance: null, firstRepaymentYear: 2020 } as const] : []),
      { plan: "plan2", balance: 20_000, firstRepaymentYear: 2020 } as const,
    ];
    const alone = project({ salary: 40_000, loans: loans(false) });
    const shared = project({ salary: 40_000, loans: loans(true) });
    // October to March is six pay months.
    expect(alone.loans[0]?.points[1]?.repaid).toBe(pounds(79 * 6));
    expect(shared.loans[1]?.points[1]?.repaid).toBe(pounds(80 * 6));
    expect(shared.assumptions.some((text) => text.includes("without a balance"))).toBe(true);
  });

  it("says when it'd be repaid if the start year is missing", () => {
    const loan = onlyLoan(
      project({
        salary: 60_000,
        loans: [{ plan: "plan2", balance: 20_000, firstRepaymentYear: null }],
      }),
    );
    expect(loan.outcome).toMatchObject({ kind: "unknown", missing: "first-repayment-year" });
    if (loan.outcome.kind === "unknown" && loan.outcome.missing === "first-repayment-year") {
      expect(loan.outcome.repaidBy).toMatch(/^20[23]\d-\d{2}-05$/);
    }
  });

  it("has no repayment date within the horizon on a low salary without a start year", () => {
    const loan = onlyLoan(
      project({
        salary: 20_000,
        loans: [{ plan: "plan2", balance: 20_000, firstRepaymentYear: null }],
      }),
    );
    expect(loan.outcome).toEqual({
      kind: "unknown",
      missing: "first-repayment-year",
      repaidBy: null,
    });
    expect(loan.points.at(-1)?.date).toBe("2086-04-05");
  });
});

describe("years without rules", () => {
  it("won't start in a tax year with no rules", () => {
    expect(
      projectStudentLoans(
        testInputs({ loans: ["plan2"] }),
        taxYearRegistry,
        new Date("2028-05-01"),
      ),
    ).toEqual({
      status: "no-rules",
      taxYear: "2028-29",
    });
  });

  it("reports pay it can't project", () => {
    const result = projectStudentLoans(
      testInputs({
        salary: 20_000,
        fromSalary: { annual: 19_000 },
        salaryGrowthPercent: -10,
        loans: [{ plan: "plan2", balance: 10_000, firstRepaymentYear: 2020 }],
      }),
      taxYearRegistry,
      start,
    );
    expect(result).toMatchObject({ status: "invalid", taxYear: "2027-28" });
  });
});

describe("threshold uprating", () => {
  it("raises by RPI and rounds up to £5", () => {
    expect(uprate(pounds(28_005), { kind: "rpi", roundUpTo: pounds(5) }, 2028, 3)).toBe(
      pounds(28_850),
    );
    // The regulations' figure for Plan 5 in 2027/28: £25,000 plus 4.1%.
    expect(uprate(pounds(25_000), { kind: "rpi", roundUpTo: pounds(5) }, 2027, 4.1)).toBe(
      pounds(26_025),
    );
  });

  it("holds Plan 2 until 2029/30", () => {
    const rule = {
      kind: "frozen-then-rpi",
      frozenThroughStartYear: 2029,
      roundUpTo: pounds(5),
    } as const;
    expect(uprate(pounds(29_385), rule, 2029, 3)).toBe(pounds(29_385));
    expect(uprate(pounds(29_385), rule, 2030, 3)).toBe(pounds(30_270));
  });

  it("keeps a fixed threshold", () => {
    expect(uprate(pounds(21_000), { kind: "fixed" }, 2035, 5)).toBe(pounds(21_000));
  });
});

describe("interest", () => {
  const thresholds = { lower: pounds(29_385), upper: pounds(52_885) };

  it("uses the announced rates for 2026/27", () => {
    expect(
      interestRate("plan1", "2026-10-06", 3, { ...thresholds, income: pounds(30_000) }),
    ).toBeCloseTo(4.1);
    expect(
      interestRate("postgraduate", "2026-10-06", 3, { ...thresholds, income: pounds(30_000) }),
    ).toBeCloseTo(6);
  });

  it("scales Plan 2 with income, capped at 6%", () => {
    const rate = (income: number, date = "2026-10-06") =>
      interestRate("plan2", date, 3, { ...thresholds, income: pounds(income) });
    expect(rate(25_000)).toBeCloseTo(4.1);
    expect(rate(41_135)).toBeCloseTo(5.6);
    expect(rate(52_885)).toBeCloseTo(6);
    expect(rate(41_135, "2027-10-06")).toBeCloseTo(4.5);
  });

  it("follows each plan's rule with the assumed RPI after the known years", () => {
    const income = { ...thresholds, income: pounds(30_000) };
    expect(interestRate("plan1", "2027-09-06", 2.5, income)).toBeCloseTo(2.5);
    expect(interestRate("plan5", "2027-09-06", 2.5, income)).toBeCloseTo(2.5);
    expect(interestRate("postgraduate", "2027-09-06", 2.5, income)).toBeCloseTo(5.5);
    expect(interestRate("postgraduate", "2027-09-06", 4, income)).toBeCloseTo(6);
  });
});
