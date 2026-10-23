import { describe, expect, it } from "vitest";
import { fromPounds as pounds } from "../money.ts";
import { calculateTakeHome } from "./engine.ts";
import type { MonthResult, TakeHomeCalculation, TakeHomeFlag } from "./result.ts";
import { rules2026To27 } from "./rules/2026-27.ts";
import { rules2027To28 } from "./rules/2027-28.ts";
import { testInputs, type TestInputs } from "./test-inputs.ts";

function calculate(overrides: TestInputs = {}): TakeHomeCalculation {
  const inputs = testInputs(overrides);
  const rules = inputs.taxYear === "2027-28" ? rules2027To28 : rules2026To27;
  const result = calculateTakeHome(inputs, rules);
  if (result.status !== "ok") {
    throw new Error(`expected a result, got ${JSON.stringify(result.issues)}`);
  }
  return result;
}

function month(result: TakeHomeCalculation, number: number): MonthResult {
  const found = result.months.find((m) => m.month === number);
  if (found === undefined) throw new Error(`no month ${String(number)}`);
  return found;
}

function flag<K extends TakeHomeFlag["kind"]>(
  result: TakeHomeCalculation,
  kind: K,
): Extract<TakeHomeFlag, { kind: K }> | undefined {
  return result.flags.find((f): f is Extract<TakeHomeFlag, { kind: K }> => f.kind === kind);
}

describe("a basic-rate employee", () => {
  const result = calculate({ salary: 36_000 });

  it("derives 1257L", () => {
    expect(result.taxCode).toMatchObject({
      source: "derived",
      display: "1257L",
      allowance: "full",
    });
  });

  it("taxes month 1 on pay less a month's free pay", () => {
    // £3,000 − £1,048.26 free pay = £1,951 (rounded down) at 20%.
    expect(month(result, 1).incomeTax).toBe(pounds(390.2));
    // (£3,000 − £1,048) at 8%.
    expect(month(result, 1).nationalInsurance).toBe(pounds(156.16));
  });

  it("takes the year's tax on cumulative pay", () => {
    // £36,000 − 12 × £1,048.26 = £23,420.88, so £23,420 at 20%.
    expect(result.annual.incomeTax).toBe(pounds(4_684));
    expect(result.annual.nationalInsurance).toBe(pounds(1_873.92));
  });

  it("has no flags and a full allowance", () => {
    expect(result.flags).toEqual([]);
    expect(result.personalAllowance).toEqual({ full: pounds(12_570), afterTaper: pounds(12_570) });
    expect(result.bonusMonth).toBeNull();
  });
});

describe("each band", () => {
  it.each([
    // Annual PAYE on cumulative pay: taxable is salary − 12 × £1,048.26, rounded down to the pound.
    [20_000, 1_484], // £7,420 × 20%
    [50_270, 7_538], // £37,690 × 20%
    [60_000, 11_428], // £7,540 + (£47,420 − £37,700) × 40%
  ])("taxes £%d a year as HMRC's routines do", (salary, tax) => {
    expect(calculate({ salary, taxCode: "1257L" }).annual.incomeTax).toBe(pounds(tax));
  });

  it("taxes additional rate income on 1257L", () => {
    // £137,720 − £12,579.12 = £125,140.88 → £125,140: exactly at the additional rate threshold.
    expect(calculate({ salary: 137_720, taxCode: "1257L" }).annual.incomeTax).toBe(pounds(42_516));
    // £10,000 more is at 45%.
    expect(calculate({ salary: 147_720, taxCode: "1257L" }).annual.incomeTax).toBe(
      pounds(42_516 + 4_500),
    );
  });
});

describe("the personal allowance taper", () => {
  const result = calculate({ salary: 110_000 });

  it("reduces the allowance by £1 for every £2 over £100,000 and derives a T code", () => {
    expect(result.adjustedNetIncome).toBe(pounds(110_000));
    expect(result.personalAllowance.afterTaper).toBe(pounds(7_570));
    expect(result.taxCode).toMatchObject({ display: "757T", allowance: "tapered" });
  });

  it("flags the 60% band with the pension needed to leave it", () => {
    expect(flag(result, "sixty-percent-band")).toEqual({
      kind: "sixty-percent-band",
      adjustedNetIncome: pounds(110_000),
      extraPensionToExit: pounds(10_000),
    });
  });

  it("puts the next £1 of salary at 60% tax plus 2% NI", () => {
    expect(result.marginalRates.salary.incomeTaxPercent).toBeCloseTo(60);
    expect(result.marginalRates.salary.nationalInsurancePercent).toBeCloseTo(2);
    expect(result.marginalRates.salary.takeHomePercent).toBeCloseTo(38);
  });

  it("derives 0T once the allowance is gone", () => {
    const above = calculate({ salary: 125_140 });
    expect(above.personalAllowance.afterTaper).toBe(0);
    expect(above.taxCode).toMatchObject({ display: "0T", allowance: "none" });
    expect(flag(above, "sixty-percent-band")).toBeUndefined();
  });

  it("doesn't touch the allowance at exactly £100,000", () => {
    const at = calculate({ salary: 100_000 });
    expect(at.taxCode.display).toBe("1257L");
    expect(flag(at, "sixty-percent-band")).toBeUndefined();
  });

  it("leaves an override code alone and taxes by it", () => {
    const overridden = calculate({ salary: 110_000, taxCode: "1257L" });
    expect(overridden.taxCode).toMatchObject({ source: "override", display: "1257L" });
    expect(overridden.annual.incomeTax).toBeLessThan(result.annual.incomeTax);
    expect(overridden.marginalRates.salary.incomeTaxPercent).toBeCloseTo(40);
  });
});

describe("Scotland", () => {
  const result = calculate({ region: "scotland", salary: 50_000 });

  it("derives an S code and uses Scottish bands", () => {
    expect(result.taxCode.display).toBe("S1257L");
    // £50,000 − £12,579.12 → £37,420: £6,320.09 to the top of the intermediate band, then
    // (£37,420 − £31,092) at 42%.
    expect(result.annual.incomeTax).toBe(pounds(8_977.85));
  });

  it("puts the next £1 at the Scottish higher rate", () => {
    expect(result.marginalRates.salary.incomeTaxPercent).toBeCloseTo(42);
  });

  it("gives 67.5% in the taper for an advanced rate taxpayer", () => {
    expect(
      calculate({ region: "scotland", salary: 110_000 }).marginalRates.salary.incomeTaxPercent,
    ).toBeCloseTo(67.5);
  });

  it("flags a code for the wrong regime", () => {
    expect(
      flag(calculate({ salary: 50_000, taxCode: "S1257L" }), "tax-code-region-mismatch"),
    ).toEqual({
      kind: "tax-code-region-mismatch",
      codeRegime: "scotland",
      region: "rest-of-uk",
    });
    expect(
      flag(calculate({ salary: 50_000, taxCode: "C1257L" }), "tax-code-region-mismatch"),
    ).toBeUndefined();
  });
});

describe("the bonus month", () => {
  const result = calculate({ salary: 60_000, bonus: 20_000, bonusMonth: 9, loans: ["plan2"] });
  const normal = result.normalMonth;
  const bonus = month(result, 9);

  it("is picked out", () => {
    expect(result.bonusMonth).toEqual(bonus);
    expect(bonus.isBonusMonth).toBe(true);
    expect(normal.isBonusMonth).toBe(false);
    expect(bonus.grossPay).toBe(pounds(25_000));
  });

  it("works out NI on the month alone, at 2% above the upper earnings limit", () => {
    // HMRC's NI guidance for software developers 2026/27, example 8: £5,000 a month is £267.50.
    expect(normal.nationalInsurance).toBe(pounds(267.5));
    // (£4,189 − £1,048) × 8% + (£25,000 − £4,189) × 2%.
    expect(bonus.nationalInsurance).toBe(pounds(251.28 + 416.22));
  });

  it("takes a student loan repayment on the month alone, rounded down to the pound", () => {
    // (£5,000 − £2,448.75) × 9% = £229.61.
    expect(normal.studentLoanTotal).toBe(pounds(229));
    // (£25,000 − £2,448.75) × 9% = £2,029.61.
    expect(bonus.studentLoanTotal).toBe(pounds(2_029));
  });

  it("taxes the year on cumulative pay, so the bonus is taxed at the annual band rate", () => {
    // £80,000 − £12,579.12 → £67,420: £7,540 + £29,720 at 40%.
    expect(result.annual.incomeTax).toBe(pounds(7_540 + 11_888));
  });

  it("shows how net pay drifts between other months", () => {
    expect(result.nonBonusNetPayRange.min).toBeLessThanOrEqual(normal.netPay);
    expect(result.nonBonusNetPayRange.max).toBeGreaterThanOrEqual(normal.netPay);
  });
});

describe("pension methods", () => {
  const base = { salary: 60_000, fromSalary: { percent: 5 }, employer: { percent: 3 } } as const;

  it("salary sacrifice cuts tax, NI and student loans, and passes on the employer's saving", () => {
    const result = calculate({
      ...base,
      method: "salary-sacrifice",
      niPassOnPercent: 100,
      loans: ["plan2"],
    });
    const first = month(result, 1);
    expect(first.salarySacrifice).toBe(pounds(250));
    expect(first.taxablePay).toBe(pounds(4_750));
    expect(first.niablePay).toBe(pounds(4_750));
    // £251.28 + (£4,750 − £4,189) × 2%.
    expect(first.nationalInsurance).toBe(pounds(262.5));
    // The employer saves 15% of the £250 sacrificed.
    expect(first.pension).toEqual({
      method: "salary-sacrifice",
      employee: pounds(250),
      employer: pounds(150),
      employerNiPassOn: pounds(37.5),
      total: pounds(437.5),
    });
    expect(first.studentLoanTotal).toBe(pounds(207)); // (£4,750 − £2,448.75) × 9%
    expect(result.adjustedNetIncome).toBe(pounds(57_000));
    expect(result.reliefAtSourceClaimable).toBeNull();
  });

  it("net pay cuts tax but not NI or student loans", () => {
    const result = calculate({
      ...base,
      method: "net-pay",
      niPassOnPercent: 100,
      loans: ["plan2"],
    });
    const first = month(result, 1);
    expect(first.salarySacrifice).toBe(0);
    expect(first.taxablePay).toBe(pounds(4_750));
    expect(first.niablePay).toBe(pounds(5_000));
    expect(first.nationalInsurance).toBe(pounds(267.5));
    expect(first.studentLoanTotal).toBe(pounds(229));
    expect(first.pension).toEqual({
      method: "net-pay",
      employee: pounds(250),
      employer: pounds(150),
      total: pounds(400),
    });
    expect(result.adjustedNetIncome).toBe(pounds(57_000));
  });

  it("relief at source is paid from net pay, with basic-rate relief added and the rest claimable", () => {
    const result = calculate({ ...base, method: "relief-at-source" });
    const first = month(result, 1);
    expect(first.taxablePay).toBe(pounds(5_000));
    expect(first.pension).toEqual({
      method: "relief-at-source",
      employee: pounds(250),
      paidFromNetPay: pounds(200),
      providerTopUp: pounds(50),
      employer: pounds(150),
      total: pounds(400),
    });
    expect(result.adjustedNetIncome).toBe(pounds(57_000));
    // The £3,000 gross contribution widens the basic rate band, moving £3,000 from 40% to 20%.
    expect(result.reliefAtSourceClaimable).toBe(pounds(600));
  });

  it("can take a fixed amount or a percentage from the bonus", () => {
    const fixed = calculate({
      salary: 60_000,
      bonus: 10_000,
      bonusMonth: 6,
      fromBonus: { annual: 4_000 },
    });
    expect(month(fixed, 6).salarySacrifice).toBe(pounds(4_000));
    expect(month(fixed, 5).salarySacrifice).toBe(0);
    const share = calculate({
      salary: 60_000,
      bonus: 10_000,
      bonusMonth: 6,
      fromBonus: { percent: 50 },
    });
    expect(month(share, 6).salarySacrifice).toBe(pounds(5_000));
  });

  it("rejects contributions bigger than the pay they come from", () => {
    const result = calculateTakeHome(
      testInputs({ salary: 10_000, fromSalary: { annual: 12_000 } }),
      rules2026To27,
    );
    expect(result).toMatchObject({
      status: "invalid",
      issues: [{ kind: "pension-exceeds-pay", from: "salary" }],
    });
  });
});

describe("the annual allowance", () => {
  it("flags contributions over £60,000", () => {
    const result = calculate({
      salary: 150_000,
      fromSalary: { annual: 55_000 },
      employer: { percent: 8 },
    });
    expect(result.annualAllowance).toMatchObject({
      allowance: pounds(60_000),
      tapered: false,
      pensionInput: pounds(67_000),
      excess: pounds(7_000),
    });
    expect(flag(result, "annual-allowance-exceeded")).toMatchObject({ excess: pounds(7_000) });
  });

  it("tapers it for very high incomes", () => {
    // Threshold income £300,000 (sacrifice added back); adjusted income £320,000.
    const result = calculate({
      salary: 300_000,
      fromSalary: { annual: 20_000 },
      employer: { annual: 20_000 },
    });
    expect(result.annualAllowance).toMatchObject({
      thresholdIncome: pounds(300_000),
      adjustedIncome: pounds(320_000),
      tapered: true,
      allowance: pounds(30_000),
      pensionInput: pounds(40_000),
      excess: pounds(10_000),
    });
  });

  it("doesn't taper below the minimum", () => {
    const result = calculate({ salary: 500_000 });
    expect(result.annualAllowance).toMatchObject({
      tapered: true,
      allowance: pounds(10_000),
      excess: 0,
    });
  });

  it("doesn't taper when threshold income is £200,000 or less", () => {
    // Relief at source contributions come off threshold income.
    const result = calculate({
      salary: 230_000,
      method: "relief-at-source",
      fromSalary: { annual: 30_000 },
      employer: { annual: 40_000 },
    });
    expect(result.annualAllowance).toMatchObject({
      thresholdIncome: pounds(200_000),
      adjustedIncome: pounds(270_000),
      tapered: false,
    });
  });
});

describe("more than one student loan plan", () => {
  // GOV.UK's example: Plan 1 and Plan 2 on £3,200 a month repay £86, of which £18 goes to Plan 1.
  it("splits one repayment between Plan 1 and Plan 2", () => {
    const result = calculate({ salary: 38_400, loans: ["plan2", "plan1"] });
    expect(month(result, 1).studentLoans).toEqual([
      { plan: "plan2", amount: pounds(68) },
      { plan: "plan1", amount: pounds(18) },
    ]);
  });

  it("gives everything to the lower-threshold plan below the next threshold", () => {
    const result = calculate({ salary: 28_800, loans: ["plan1", "plan2"] });
    // (£2,400 − £2,241.66) × 9% = £14.25.
    expect(month(result, 1).studentLoans).toEqual([
      { plan: "plan1", amount: pounds(14) },
      { plan: "plan2", amount: 0 },
    ]);
  });

  // GOV.UK's example: a Postgraduate Loan and Plan 2 on £2,500 a month repay £45 and £4.
  it("repays a Postgraduate Loan alongside", () => {
    const result = calculate({ salary: 30_000, loans: ["postgraduate", "plan2"] });
    expect(month(result, 1).studentLoans).toEqual([
      { plan: "postgraduate", amount: pounds(45) },
      { plan: "plan2", amount: pounds(4) },
    ]);
    expect(result.marginalRates.salary.studentLoansPercent).toBeCloseTo(15);
  });

  it("handles three plans", () => {
    const result = calculate({ salary: 38_400, loans: ["plan1", "plan2", "postgraduate"] });
    // PGL: (£3,200 − £1,750) × 6% = £87.
    expect(month(result, 1).studentLoans).toEqual([
      { plan: "plan1", amount: pounds(18) },
      { plan: "plan2", amount: pounds(68) },
      { plan: "postgraduate", amount: pounds(87) },
    ]);
    expect(result.annual.studentLoans.map((loan) => loan.amount)).toEqual([
      pounds(18 * 12),
      pounds(68 * 12),
      pounds(87 * 12),
    ]);
  });
});

describe("tax code overrides", () => {
  const salary = 36_000;

  it.each([
    ["BR", 7_200],
    ["D0", 14_400],
    ["D1", 16_200],
    ["SBR", 7_200],
    ["SD0", 7_560],
    ["SD1", 15_120],
    ["SD2", 16_200],
    ["SD3", 17_280],
    ["CD1", 16_200],
    ["NT", 0],
    ["0T", 7_200],
  ])("taxes £36,000 on %s", (taxCode, tax) => {
    expect(calculate({ salary, taxCode }).annual.incomeTax).toBe(pounds(tax));
  });

  it("treats M, N and T suffixes like L", () => {
    const tax = calculate({ salary, taxCode: "1257L" }).annual.incomeTax;
    for (const taxCode of ["1257M", "1257N", "1257T"]) {
      expect(calculate({ salary, taxCode }).annual.incomeTax, taxCode).toBe(tax);
    }
  });

  it("taxes each month alone on W1, M1 and X codes", () => {
    const options = { salary: 36_000, bonus: 24_000, bonusMonth: 6 };
    const cumulative = calculate({ ...options, taxCode: "1257L" });
    for (const taxCode of ["1257L M1", "1257LW1", "1257L X", "1257L/M1"]) {
      const result = calculate({ ...options, taxCode });
      expect(result.taxCode.code.basis, taxCode).toBe("non-cumulative");
      // Month 6 alone: £27,000 − £1,048.26 → £25,951, above the month's share of £125,140
      // (£10,428.3333), so £42,516 ÷ 12 plus 45% of the rest.
      expect(month(result, 1).incomeTax).toBe(month(cumulative, 1).incomeTax);
      expect(month(result, 6).incomeTax).toBe(pounds(3_543 + 6_985.2));
    }
  });

  it("adds K code pay and stops at 50% of the month's pay", () => {
    // K500 adds £417.42 a month.
    const small = calculate({ salary: 24_000, taxCode: "K500" });
    // £2,417.42 → £2,417 at 20%.
    expect(month(small, 1).incomeTax).toBe(pounds(483.4));
    expect(small.incomeTaxNotDeducted).toBe(0);

    // K5000 adds £4,167.45 a month (nine lots of £416.67 and £417.42) to £1,000 pay; the tax due
    // each month is limited to £500.
    const large = calculate({ salary: 12_000, taxCode: "K5000" });
    expect(large.months.every((m) => m.incomeTax === pounds(500))).toBe(true);
    expect(large.incomeTaxNotDeducted).toBeGreaterThan(0);
    expect(flag(large, "tax-not-deducted")?.amount).toBe(large.incomeTaxNotDeducted);
    // £12,000 + £50,009.40 → £62,009: £7,540 + £24,309 × 40%, less the £6,000 deducted.
    expect(large.incomeTaxNotDeducted).toBe(pounds(7_540 + 9_723.6 - 6_000));
  });

  it("carries tax held back by the limit into later months on a cumulative K code", () => {
    // The limit binds every month until a bonus in March, which collects the shortfall.
    const options = { salary: 12_000, bonus: 40_000, bonusMonth: 12, taxCode: "K3000" } as const;
    const cumulative = calculate(options);
    expect(month(cumulative, 1).incomeTax).toBe(pounds(500));
    // K3000 adds £2,500.77 a month: £52,000 + £30,009.24 → £82,009 for the year.
    expect(cumulative.annual.incomeTax).toBe(pounds(7_540 + 17_723.6));
    expect(cumulative.incomeTaxNotDeducted).toBe(0);

    const nonCumulative = calculate({ ...options, taxCode: "K3000 M1" });
    expect(nonCumulative.incomeTaxNotDeducted).toBeGreaterThan(0);
    expect(nonCumulative.annual.incomeTax).toBeLessThan(cumulative.annual.incomeTax);
  });

  it.each(["1257", "12A7L", "D2", "SD4", "SNT", "K0", "K012", "0L", "01257L", "1257L M2", "X"])(
    "rejects %s with a message",
    (taxCode) => {
      const result = calculateTakeHome(testInputs({ taxCode }), rules2026To27);
      expect(result.status).toBe("invalid");
      if (result.status === "invalid") {
        expect(result.issues).toEqual([
          { kind: "invalid-tax-code", input: taxCode, message: expect.any(String) as string },
        ]);
      }
    },
  );

  it("accepts lower case and spaces", () => {
    expect(calculate({ taxCode: " s1257l " }).taxCode).toMatchObject({
      source: "override",
      display: "S1257L",
    });
  });
});

describe("2027/28", () => {
  it("flags provisional figures that were used, and only those", () => {
    const rest = calculate({ taxYear: "2027-28", salary: 40_000, loans: ["plan2"] });
    expect(flag(rest, "provisional-figures")).toBeUndefined();

    const scottish = calculate({
      taxYear: "2027-28",
      region: "scotland",
      salary: 40_000,
      loans: ["plan4", "plan5"],
    });
    expect(flag(scottish, "provisional-figures")?.figures.map((figure) => figure.label)).toEqual([
      "Scottish income tax bands",
      "Plan 4 repayment threshold",
      "Plan 5 repayment threshold",
    ]);
  });

  it("uses the new Plan 1 threshold", () => {
    // £28,005 ÷ 12 = £2,333.75; (£3,000 − £2,333.75) × 9% = £59.96.
    expect(
      month(calculate({ taxYear: "2027-28", salary: 36_000, loans: ["plan1"] }), 1)
        .studentLoanTotal,
    ).toBe(pounds(59));
  });

  it("refuses rules for a different year", () => {
    expect(() => calculateTakeHome(testInputs({ taxYear: "2027-28" }), rules2026To27)).toThrow();
  });
});

describe("a high earner with a large bonus and a fixed sacrifice", () => {
  const options = {
    salary: 130_000,
    bonus: 40_000,
    bonusMonth: 12,
    method: "salary-sacrifice",
    fromSalary: { annual: 30_000 },
    employer: { percent: 8 },
    loans: [{ plan: "plan2", balance: 45_000, firstRepaymentYear: 2020 }],
  } as const;
  const result = calculate(options);

  it("loses the whole allowance", () => {
    expect(result.adjustedNetIncome).toBe(pounds(140_000));
    expect(result.taxCode).toMatchObject({ display: "0T", allowance: "none" });
    expect(flag(result, "sixty-percent-band")).toBeUndefined();
  });

  it("has a normal month worked out by hand", () => {
    const first = month(result, 1);
    expect(first).toMatchObject({
      grossPay: pounds(10_833.33),
      salarySacrifice: pounds(2_500),
      taxablePay: pounds(8_333.33),
      // 0T, month 1: £7,540 ÷ 12 + (£8,333 − £3,141.6666) × 40%.
      incomeTax: pounds(2_704.86),
      // £251.28 + (£8,333.33 − £4,189) × 2% = £82.8866, which rounds up.
      nationalInsurance: pounds(334.17),
      // (£8,333.33 − £2,448.75) × 9% = £529.61.
      studentLoanTotal: pounds(529),
      netPay: pounds(4_765.3),
    });
    expect(first.pension).toMatchObject({ employee: pounds(2_500), employer: pounds(866.67) });
    // Taxable pay to date is rounded down to the pound, so a month's tax can move by 40p.
    expect(result.nonBonusNetPayRange).toEqual({ min: pounds(4_764.9), max: pounds(4_765.3) });
  });

  it("has a bonus month worked out by hand", () => {
    expect(result.bonusMonth).toMatchObject({
      month: 12,
      grossPay: pounds(50_833.37),
      niablePay: pounds(48_333.37),
      // The year's tax on £140,000 (£49,203) less £29,754.73 taken in months 1 to 11.
      incomeTax: pounds(19_448.27),
      // £251.28 + (£48,333.37 − £4,189) × 2% = £882.8874, which rounds up.
      nationalInsurance: pounds(1_134.17),
      // (£48,333.37 − £2,448.75) × 9% = £4,129.62.
      studentLoanTotal: pounds(4_129),
      netPay: pounds(23_621.93),
    });
    expect(result.annual.incomeTax).toBe(pounds(7_540 + 34_976 + 6_687));
  });

  it("stays within the annual allowance", () => {
    expect(result.annualAllowance).toMatchObject({
      // 8% is taken each month, so rounding adds 4p over the year.
      pensionInput: pounds(40_400.04),
      thresholdIncome: pounds(170_000),
      tapered: false,
      excess: 0,
    });
  });

  it("puts the next £1 at 45% tax, 2% NI and 9% student loan", () => {
    for (const rates of [result.marginalRates.salary, result.marginalRates.bonus]) {
      expect(rates.incomeTaxPercent).toBeCloseTo(45);
      expect(rates.nationalInsurancePercent).toBeCloseTo(2);
      expect(rates.studentLoansPercent).toBeCloseTo(9);
      expect(rates.takeHomePercent).toBeCloseTo(44);
    }
  });

  it("lands in the 60% band when half the bonus is sacrificed too", () => {
    const sacrificingBonus = calculate({ ...options, fromBonus: { percent: 50 } });
    expect(sacrificingBonus.adjustedNetIncome).toBe(pounds(120_000));
    expect(sacrificingBonus.taxCode.display).toBe("257T");
    expect(flag(sacrificingBonus, "sixty-percent-band")?.extraPensionToExit).toBe(pounds(20_000));
    // Half of the next £1 of bonus is sacrificed; the other half is taxed at 40% and withdraws
    // 25p of allowance, which is taxed at 40% too.
    expect(sacrificingBonus.marginalRates.bonus).toMatchObject({
      incomeTaxPercent: expect.closeTo(30, 5) as number,
      nationalInsurancePercent: expect.closeTo(1, 5) as number,
      studentLoansPercent: expect.closeTo(4.5, 5) as number,
      pensionPercent: expect.closeTo(50, 5) as number,
      takeHomePercent: expect.closeTo(14.5, 5) as number,
    });
  });
});
