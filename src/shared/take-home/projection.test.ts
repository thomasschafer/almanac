import { describe, expect, it } from "vitest";
import { fromPounds as pounds } from "../money.ts";
import { interestRate, projectStudentLoans, uprate } from "./projection.ts";
import type { FirstPaid } from "./inputs.ts";
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
    expect(
      projection.assumptions.some(
        (text) =>
          text.includes("6% cap is announced for the 2026/27 academic year, to 31 August 2027") &&
          text.includes("modelling assumption"),
      ),
    ).toBe(true);
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

describe("older Plan 1 and Plan 4 loans", () => {
  const plan1 = (firstPaid: FirstPaid, salary = 20_000) =>
    onlyLoan(
      project({
        salary,
        loans: [{ plan: "plan1", balance: 10_000, firstRepaymentYear: 2010, firstPaid }],
      }),
    );
  const plan4 = (firstPaid: FirstPaid, firstRepaymentYear: number | null = 2000) =>
    onlyLoan(
      project({
        salary: 20_000,
        loans: [{ plan: "plan4", balance: 30_000, firstRepaymentYear, firstPaid }],
      }),
    );
  const plan1Terms = { firstPaidBefore: "2006-09-01", writeOff: { kind: "at-age", age: 65 } };
  const plan4Terms = {
    firstPaidBefore: "2007-08-01",
    writeOff: { kind: "at-age-or-term", age: 65 },
  };

  it("keep the usual term when first paid on or after the cutoff", () => {
    expect(plan1("on-or-after-cutoff").outcome).toMatchObject({
      kind: "written-off",
      date: "2035-04-06",
    });
    expect(plan4("on-or-after-cutoff").outcome).toMatchObject({
      kind: "written-off",
      date: "2030-04-06",
    });
  });

  it("have no write-off date for a Plan 1 loan first paid before the cutoff", () => {
    const loan = plan1("before-cutoff");
    expect(loan.outcome).toEqual({
      kind: "may-be-written-off-at-age",
      firstPaid: "before-cutoff",
      terms: plan1Terms,
      firstRepaymentYearKnown: true,
      repaidBy: null,
      termWriteOff: null,
    });
    expect(loan.points.at(-1)?.date).toBe("2086-04-05");
    expectBalanceAddsUp(loan, 10_000);
  });

  it("give the usual term as the newer loans' date when not sure", () => {
    expect(plan1("not-sure").outcome).toEqual({
      kind: "may-be-written-off-at-age",
      firstPaid: "not-sure",
      terms: plan1Terms,
      firstRepaymentYearKnown: true,
      repaidBy: null,
      termWriteOff: { appliesTo: "newer-loans", date: "2035-04-06" },
    });
  });

  it("say when it'd be repaid, unless written off first", () => {
    const loan = plan1("not-sure", 60_000);
    expect(loan.outcome).toMatchObject({
      kind: "may-be-written-off-at-age",
      termWriteOff: null,
    });
    if (loan.outcome.kind === "may-be-written-off-at-age") {
      expect(loan.outcome.repaidBy).toMatch(/^20[23]\d-\d{2}-05$/);
    }
  });

  it("write off a Plan 4 loan by the usual term at the latest, as 65 may come first", () => {
    for (const firstPaid of ["before-cutoff", "not-sure"] as const) {
      const loan = plan4(firstPaid);
      expect(loan.outcome).toMatchObject({
        kind: "may-be-written-off-at-age",
        firstPaid,
        terms: plan4Terms,
        repaidBy: null,
        termWriteOff: { appliesTo: "every-loan", date: "2030-04-06" },
      });
      expect(loan.points.at(-1)?.date).toBe("2030-04-06");
    }
    expect(plan4("not-sure", 1995).outcome).toMatchObject({
      termWriteOff: { appliesTo: "every-loan", date: "2025-04-06" },
    });
  });

  it("say when the first repayment year isn't known", () => {
    expect(plan4("before-cutoff", null).outcome).toMatchObject({
      kind: "may-be-written-off-at-age",
      firstRepaymentYearKnown: false,
      termWriteOff: null,
    });
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

describe("repayments that aren't due yet", () => {
  const options = {
    salary: 45_000,
    loans: [{ plan: "plan2", balance: 30_000, firstRepaymentYear: 2028 }],
  } as const;
  const loan = onlyLoan(project(options));

  it("adds interest but takes nothing until 6 April of the first repayment year", () => {
    const before = loan.months.filter((m) => m.date < "2028-04-06");
    expect(before.length).toBe(18);
    expect(before.every((m) => m.repaid === 0 && m.interest > 0)).toBe(true);
    expect(loan.months.find((m) => m.date === "2028-05-05")?.repaid).toBeGreaterThan(0);
    expect(loan.repaymentsStart).toBe("2028-04-06");
    expectBalanceAddsUp(loan, 30_000);
  });

  it("doesn't take a share of another plan's repayments before then", () => {
    const shared = project({
      salary: 45_000,
      loans: [
        { plan: "plan1", balance: 20_000, firstRepaymentYear: 2015 },
        { plan: "plan2", balance: 30_000, firstRepaymentYear: 2028 },
      ],
    });
    const alone = project({
      salary: 45_000,
      loans: [{ plan: "plan1", balance: 20_000, firstRepaymentYear: 2015 }],
    });
    const firstYear = (projection: typeof alone) => projection.loans[0]?.points[1]?.repaid;
    expect(firstYear(shared)).toBe(firstYear(alone));
  });

  it("starts at once when the year is past or unknown", () => {
    for (const firstRepaymentYear of [2020, 2026, null]) {
      const started = onlyLoan(
        project({ ...options, loans: [{ plan: "plan2", balance: 30_000, firstRepaymentYear }] }),
      );
      expect(started.repaymentsStart).toBeNull();
      expect(started.months[0]?.repaid).toBeGreaterThan(0);
    }
  });
});

describe("a loan that's already repaid", () => {
  it("is reported as repaid, with nothing to chart or take", () => {
    const projection = project({
      salary: 45_000,
      loans: [{ plan: "plan2", balance: 0, firstRepaymentYear: null }],
    });
    const loan = onlyLoan(projection);
    expect(loan.outcome).toEqual({ kind: "already-repaid" });
    expect(loan.points).toEqual([]);
    expect(loan.months).toEqual([]);
    expect(projection.totalRepaid).toBe(0);
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
  const due = (income: number) =>
    ({ kind: "repayments-due", plan2: { ...thresholds, income: pounds(income) } }) as const;
  const beforeDue = { kind: "before-repayments-due" } as const;

  it("uses the announced rates for 2026/27", () => {
    expect(interestRate("plan1", "2026-10-06", 3, due(30_000))).toBeCloseTo(4.1);
    expect(interestRate("postgraduate", "2026-10-06", 3, due(30_000))).toBeCloseTo(6);
  });

  it("scales Plan 2 with income, capped at 6%", () => {
    const rate = (income: number, date = "2026-10-06") =>
      interestRate("plan2", date, 3, due(income));
    expect(rate(25_000)).toBeCloseTo(4.1);
    expect(rate(41_135)).toBeCloseTo(5.6);
    expect(rate(52_885)).toBeCloseTo(6);
    expect(rate(41_135, "2027-10-06")).toBeCloseTo(4.5);
  });

  it("follows each plan's rule with the assumed RPI after the known years", () => {
    const income = due(30_000);
    expect(interestRate("plan1", "2027-09-06", 2.5, income)).toBeCloseTo(2.5);
    expect(interestRate("plan5", "2027-09-06", 2.5, income)).toBeCloseTo(2.5);
    expect(interestRate("postgraduate", "2027-09-06", 2.5, income)).toBeCloseTo(5.5);
    expect(interestRate("postgraduate", "2027-09-06", 4, income)).toBeCloseTo(6);
  });

  it("charges Plan 2 RPI + 3%, capped, before repayments are due", () => {
    expect(interestRate("plan2", "2026-10-06", 3, beforeDue)).toBeCloseTo(6);
    expect(interestRate("plan2", "2027-10-06", 2, beforeDue)).toBeCloseTo(5);
    expect(interestRate("plan2", "2027-10-06", 4, beforeDue)).toBeCloseTo(6);
  });

  it("leaves the other plans' rates the same before repayments are due", () => {
    for (const plan of ["plan1", "plan4", "plan5", "postgraduate"] as const) {
      for (const [date, rpi] of [
        ["2026-10-06", 3],
        ["2027-10-06", 2],
        ["2027-10-06", 4],
      ] as const) {
        expect(interestRate(plan, date, rpi, beforeDue)).toBe(
          interestRate(plan, date, rpi, due(30_000)),
        );
      }
    }
    // The Postgraduate Loan is RPI + 3%, capped at 6%, throughout.
    expect(interestRate("postgraduate", "2027-10-06", 2, beforeDue)).toBeCloseTo(5);
  });
});

describe("Plan 2 interest before repayments are due", () => {
  // On £20,000, below the repayment threshold, the income-linked rate would be RPI alone.
  const options = {
    salary: 20_000,
    loans: [{ plan: "plan2", balance: 30_000, firstRepaymentYear: 2028 }],
    rpiPercent: 2,
  } as const;
  const projection = project(options);
  const loan = onlyLoan(projection);
  const rateOn = (date: string) => loan.months.find((m) => m.date === date)?.interestRatePercent;

  it("is RPI + 3%, capped at 6%, until 6 April of the first repayment year", () => {
    // 2026/27 is announced at 6%; after that, RPI 2% + 3%.
    expect(rateOn("2026-11-05")).toBeCloseTo(6);
    expect(rateOn("2027-10-05")).toBeCloseTo(5);
    expect(rateOn("2028-04-05")).toBeCloseTo(5);
  });

  it("becomes income-linked once repayments are due", () => {
    expect(rateOn("2028-05-05")).toBeCloseTo(2);
    expectBalanceAddsUp(loan, 30_000);
  });

  it("lists the assumption", () => {
    expect(
      projection.assumptions.some((text) =>
        text.startsWith("Plan 2 interest before repayments are due: RPI + 3% while studying"),
      ),
    ).toBe(true);
    const started = project({
      ...options,
      loans: [{ plan: "plan2", balance: 30_000, firstRepaymentYear: 2020 }],
    });
    expect(started.assumptions.some((text) => text.includes("before repayments are due"))).toBe(
      false,
    );
  });

  it("is income-linked throughout when the first repayment year is unknown", () => {
    const unknown = onlyLoan(
      project({
        ...options,
        loans: [{ plan: "plan2", balance: 30_000, firstRepaymentYear: null }],
      }),
    );
    expect(unknown.months.find((m) => m.date === "2027-10-05")?.interestRatePercent).toBeCloseTo(2);
  });
});

describe("monthly detail", () => {
  it("records every month, consistent with the totals and the balance", () => {
    const inputs = testInputs({
      salary: 60_000,
      loans: [{ plan: "plan2", balance: 30_000, firstRepaymentYear: 2020 }],
      salaryGrowthPercent: 2,
    });
    const projection = projectStudentLoans(
      inputs,
      taxYearRegistry,
      new Date("2026-10-23T12:00:00Z"),
    );
    if (projection.status !== "ok") throw new Error(projection.status);
    const [loan] = projection.loans;
    if (loan === undefined) throw new Error("no loan");
    expect(loan.months.length).toBeGreaterThan(12);
    expect(loan.months.reduce((total, m) => total + m.repaid, 0)).toBe(loan.totalRepaid);
    expect(loan.months.reduce((total, m) => total + m.interest, 0)).toBe(loan.totalInterest);
    let balance = 3_000_000;
    for (const month of loan.months) {
      balance = balance + month.interest - month.repaid;
      expect(month.balance).toBe(balance);
    }
    expect(loan.months.at(-1)?.balance).toBe(0);
  });
});
