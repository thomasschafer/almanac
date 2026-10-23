import { describe, expect, it } from "vitest";
import { fromPounds as pounds } from "../money.ts";
import { rateOfForNi, splitAcrossMonths } from "./arithmetic.ts";
import { employeeNi, employerNi, type NiRates } from "./ni.ts";
import { monthlyAdjustment } from "./paye.ts";
import { rules2026To27 } from "./rules/2026-27.ts";
import { percent } from "./rules/types.ts";
import { studentLoanRepayments } from "./student-loan-repayments.ts";
import { deriveTaxCode, formatTaxCode, parseTaxCode } from "./tax-code.ts";

const ni = rules2026To27.nationalInsurance;
const weekly: NiRates = {
  primaryThreshold: pounds(242),
  upperEarningsLimit: pounds(967),
  mainRate: ni.mainRate.value,
  upperRate: ni.upperRate.value,
  secondaryThreshold: pounds(96),
  employerRate: ni.employerRate.value,
};
const monthly: NiRates = {
  ...weekly,
  primaryThreshold: pounds(1_048),
  upperEarningsLimit: pounds(4_189),
  secondaryThreshold: pounds(417),
};

// Worked examples from HMRC's NI guidance for software developers 2026 to 2027, appendix 2:
// https://www.gov.uk/government/publications/2026-to-2027-ni-guidance-for-software-developers
describe("NI", () => {
  it("matches HMRC example 1: £129.53 a week", () => {
    expect(employeeNi(pounds(129.53), weekly)).toBe(0);
    // £33.53 × 15% = £5.0295, which rounds to £5.03.
    expect(employerNi(pounds(129.53), weekly)).toBe(pounds(5.03));
  });

  it("matches HMRC example 2: £1,000 a week", () => {
    // £725 × 8% + £33 × 2%.
    expect(employeeNi(pounds(1_000), weekly)).toBe(pounds(58.66));
  });

  it("matches HMRC example 8: £5,000 a month (employee)", () => {
    expect(employeeNi(pounds(5_000), monthly)).toBe(pounds(267.5));
    // Category A employer: (£4,189 − £417) × 15% + £811 × 15%.
    expect(employerNi(pounds(5_000), monthly)).toBe(pounds(565.8 + 121.65));
  });

  it("disregards a halfpenny or less, looking only at the third decimal place", () => {
    // £67.5558 is £67.55 and £67.5568 is £67.56 (NI guidance section 4.2).
    expect(rateOfForNi(pounds(3_377.79), percent(2))).toBe(pounds(67.55));
    expect(rateOfForNi(pounds(3_377.84), percent(2))).toBe(pounds(67.56));
    expect(rateOfForNi(pounds(100.06), percent(5))).toBe(pounds(5));
  });
});

describe("free pay and additional pay", () => {
  it.each([
    [0, 0],
    [1, 1.59], // £19 ÷ 12, rounded up
    [500, 417.42], // £5,009 ÷ 12, rounded up
    [501, 418.26], // £416.67 + £19 ÷ 12 rounded up
    [1257, 1_048.26], // 2 × £416.67 + £2,579 ÷ 12 rounded up
  ])("gives code %d £%d a month", (code, amount) => {
    expect(monthlyAdjustment(code)).toBe(pounds(amount));
  });
});

describe("student loan repayments", () => {
  const rules = rules2026To27.studentLoans;

  it("rounds down to the pound", () => {
    // (£3,000 − £2,448.75) × 9% = £49.61.
    expect(studentLoanRepayments(pounds(3_000), ["plan2"], rules)).toEqual([
      { plan: "plan2", amount: pounds(49) },
    ]);
  });

  it("takes nothing at or below the threshold", () => {
    expect(studentLoanRepayments(pounds(2_448.75), ["plan2"], rules)).toEqual([
      { plan: "plan2", amount: 0 },
    ]);
  });

  it("caps the lower plan at the rate on the gap between thresholds", () => {
    // Plan 1 and Plan 4: one repayment of (£4,000 − £2,241.66) × 9% = £158.25, with Plan 1
    // capped at (£2,816.25 − £2,241.66) × 9% = £51.71, so £51.
    expect(studentLoanRepayments(pounds(4_000), ["plan4", "plan1"], rules)).toEqual([
      { plan: "plan4", amount: pounds(107) },
      { plan: "plan1", amount: pounds(51) },
    ]);
  });

  it("refuses duplicate plans", () => {
    expect(() => studentLoanRepayments(pounds(4_000), ["plan2", "plan2"], rules)).toThrow();
  });
});

describe("tax codes", () => {
  const bands = (regime: "rest-of-uk" | "scotland" | "wales") =>
    rules2026To27.incomeTax.bands[regime].value;

  it.each([
    [
      "1257L",
      { kind: "allowance", regime: "rest-of-uk", number: 1257, suffix: "L", basis: "cumulative" },
    ],
    [
      "S1100T",
      { kind: "allowance", regime: "scotland", number: 1100, suffix: "T", basis: "cumulative" },
    ],
    ["C0T", { kind: "allowance", regime: "wales", number: 0, suffix: "T", basis: "cumulative" }],
    ["K475", { kind: "k", regime: "rest-of-uk", number: 475, basis: "cumulative" }],
    ["SK100 W1", { kind: "k", regime: "scotland", number: 100, basis: "non-cumulative" }],
    ["BR", { kind: "flat", regime: "rest-of-uk", bandsAboveBasic: 0, basis: "cumulative" }],
    ["D1", { kind: "flat", regime: "rest-of-uk", bandsAboveBasic: 2, basis: "cumulative" }],
    ["SD3", { kind: "flat", regime: "scotland", bandsAboveBasic: 4, basis: "cumulative" }],
    ["NT", { kind: "no-tax", basis: "cumulative" }],
    [
      "1257LX",
      {
        kind: "allowance",
        regime: "rest-of-uk",
        number: 1257,
        suffix: "L",
        basis: "non-cumulative",
      },
    ],
  ])("parses %s", (input, code) => {
    expect(parseTaxCode(input, bands)).toEqual({ ok: true, code });
  });

  it("explains why a D code doesn't exist", () => {
    expect(parseTaxCode("SD4", bands)).toEqual({
      ok: false,
      message: "There's no SD4 code for Scottish rates: the highest is SD3.",
    });
  });

  it("formats codes back", () => {
    for (const input of ["1257L", "S1100T", "K475", "SBR", "CD0", "NT", "1257L M1"]) {
      const parsed = parseTaxCode(input, bands);
      if (!parsed.ok) throw new Error(parsed.message);
      expect(formatTaxCode(parsed.code)).toBe(input);
    }
  });

  it.each([
    [12_570, "1257L", "full"],
    [7_569.5, "756T", "tapered"],
    [15, "1T", "tapered"],
    [0.5, "0T", "none"],
    [0, "0T", "none"],
  ])("derives the code for an allowance of £%d", (allowance, display, kind) => {
    expect(deriveTaxCode(pounds(allowance), pounds(12_570), "rest-of-uk")).toMatchObject({
      display,
      allowance: kind,
    });
  });
});

describe("splitting across months", () => {
  it("adds up exactly, with the remainder in March", () => {
    const months = splitAcrossMonths(pounds(100_000));
    expect(months.slice(0, 11).every((amount) => amount === pounds(8_333.33))).toBe(true);
    expect(months[11]).toBe(pounds(8_333.37));
  });
});
