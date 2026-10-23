import { describe, expect, it } from "vitest";
import { fromPounds as pounds, type Pence } from "../../money.ts";
import { studentLoanPlans } from "../inputs.ts";
import {
  assertValidRegistry,
  findTaxYearRules,
  startYearOfTaxYear,
  taxYearId,
  taxYearRegistry,
} from "./registry.ts";
import { monthlyRepaymentThreshold } from "./student-loans.ts";
import {
  percent,
  taxRegimes,
  type IncomeTaxBands,
  type Sourced,
  type TaxYearRules,
} from "./types.ts";

function bandsInOrder(bands: IncomeTaxBands) {
  return [...bands.belowBasic, bands.basic, ...bands.aboveBasic];
}

/** Every Sourced value in a year's rules, found by walking the object. */
function sourcedValues(
  value: unknown,
  path: string,
): { path: string; sourced: Sourced<unknown> }[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  if ("status" in value && "source" in value && "value" in value) {
    return [{ path, sourced: value as Sourced<unknown> }];
  }
  return Object.entries(value).flatMap(([key, child]) => sourcedValues(child, `${path}.${key}`));
}

describe("the registry", () => {
  it("is in order with no gaps", () => {
    expect(() => {
      assertValidRegistry(taxYearRegistry);
    }).not.toThrow();
    expect(taxYearRegistry.map((rules) => rules.id)).toEqual(["2026-27", "2027-28"]);
  });

  it("rejects a gap", () => {
    const [first] = taxYearRegistry;
    if (first === undefined) throw new Error("empty registry");
    const later: TaxYearRules = { ...first, id: "2028-29", startYear: 2028 };
    expect(() => {
      assertValidRegistry([first, later]);
    }).toThrow("doesn't follow");
  });

  it("converts between ids and start years", () => {
    expect(taxYearId(2026)).toBe("2026-27");
    expect(taxYearId(2099)).toBe("2099-00");
    expect(startYearOfTaxYear("2027-28")).toBe(2027);
    expect(() => startYearOfTaxYear("2027-29")).toThrow();
    expect(findTaxYearRules(taxYearRegistry, "2025-26")).toBeUndefined();
  });
});

describe.each(taxYearRegistry)("rules for $id", (rules) => {
  it("records a source for every value, and why any provisional one is provisional", () => {
    const values = sourcedValues(rules, rules.id);
    expect(values.length).toBe(27);
    for (const { path, sourced } of values) {
      expect(sourced.source, path).toMatch(/^https:\/\/(www\.)?[a-z.]+\.(gov\.uk|scot|org\.uk)\//);
      if (sourced.status === "provisional") {
        expect(sourced.note, path).toBeTruthy();
      }
    }
  });

  it("was reviewed on a real date", () => {
    expect(rules.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(rules.lastReviewed))).toBe(false);
  });

  it("has monthly student loan thresholds HMRC's way", () => {
    for (const plan of studentLoanPlans) {
      const { annual, monthly } = rules.studentLoans[plan].threshold.value;
      expect(monthly, plan).toBe(monthlyRepaymentThreshold(annual));
    }
  });

  it("has bands whose rates rise", () => {
    for (const regime of taxRegimes) {
      const bands = rules.incomeTax.bands[regime].value;
      const rates = [...bandsInOrder(bands).map((band) => band.rate), bands.top.rate];
      expect(rates, regime).toEqual([...rates].sort((a, b) => a - b));
    }
  });
});

describe("2026/27 rules", () => {
  const rules = taxYearRegistry[0];
  if (rules === undefined) throw new Error("empty registry");

  it("matches HMRC's published monthly student loan thresholds", () => {
    const monthly = Object.fromEntries(
      studentLoanPlans.map((plan) => [plan, rules.studentLoans[plan].threshold.value.monthly]),
    );
    expect(monthly).toEqual({
      plan1: pounds(2_241.66),
      plan2: pounds(2_448.75),
      plan4: pounds(2_816.25),
      plan5: pounds(2_083.33),
      postgraduate: pounds(1_750),
    });
  });

  // The cumulative band limits and annual tax figures in HMRC's PAYE specification, Appendix A and
  // B, version 24.0.
  it.each([
    ["rest-of-uk", [37_700, 125_140], [7_540, 42_516]],
    [
      "scotland",
      [3_967, 16_956, 31_092, 62_430, 125_140],
      [753.73, 3_351.53, 6_320.09, 19_482.05, 47_701.55],
    ],
  ] as const)("gives %s the same band limits and tax as HMRC", (regime, limits, taxes) => {
    let limit = 0 as Pence;
    let tax = 0;
    const cumulative = bandsInOrder(rules.incomeTax.bands[regime].value).map((band) => {
      limit = (limit + band.width) as Pence;
      tax += (band.width * band.rate) / 10_000;
      return { limit, tax: Math.round(tax) };
    });
    expect(cumulative).toEqual(
      limits.map((value, index) => ({ limit: pounds(value), tax: pounds(taxes[index] ?? 0) })),
    );
  });
});

describe("percent", () => {
  it("holds rates as basis points", () => {
    expect(percent(1.85)).toBe(185);
    expect(percent(45)).toBe(4_500);
  });

  it("rejects anything finer than a basis point", () => {
    expect(() => percent(1.855)).toThrow();
    expect(() => percent(-1)).toThrow();
    expect(() => percent(Number.NaN)).toThrow();
  });
});
