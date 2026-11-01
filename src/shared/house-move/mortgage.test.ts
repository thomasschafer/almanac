import { describe, expect, it } from "vitest";
import { asPence, fromPounds as pounds } from "../money.ts";
import { percent } from "../rates.ts";
import { annuityPayment } from "./arithmetic.ts";
import { mortgageProjection, paymentOverrideProblem } from "./mortgage.ts";
import { testInputs, today } from "./test-inputs.ts";

describe("mortgage arithmetic", () => {
  it("matches an independently calculated annuity and monthly amortisation", () => {
    // £1,000 × 0.01 / (1 - 1.01^-12) = £88.8487886783 -> £88.85.
    expect(annuityPayment(pounds(1000), percent(12), 12)).toBe(pounds(88.85));
    const mortgage = { ...testInputs().mortgage, balance: pounds(1000), rate: percent(12) };
    const projection = mortgageProjection(mortgage, today, 12);
    // First: £1,000 + £10 interest - £88.85 = £921.15.
    expect(projection.months[1]).toEqual({
      balance: pounds(921.15),
      interest: pounds(10),
      payment: pounds(88.85),
      overpayment: 0,
    });
    // Second: £921.15 + round(£9.2115) - £88.85 = £841.51.
    expect(projection.months[2]?.balance).toBe(pounds(841.51));
    expect(projection.months[12]?.balance).toBe(0);
    expect(projection.months[12]?.payment).toBeLessThanOrEqual(pounds(88.85));
    expect(projection.warnings).toEqual([]);
    for (let i = 1; i <= 12; i++) {
      const before = projection.months[i - 1];
      const after = projection.months[i];
      if (!before || !after) throw new Error("Missing test month");
      expect(after.balance).toBe(
        before.balance + after.interest - after.payment - after.overpayment,
      );
    }
  });

  it("handles zero interest and an exact final payment after a small overpayment", () => {
    expect(annuityPayment(pounds(1200), percent(0), 12)).toBe(pounds(100));
    const mortgage = { ...testInputs().mortgage, monthlyOverpayment: pounds(1) };
    const rows = mortgageProjection(mortgage, today, 14).months;
    expect(rows[12]?.payment).toBe(pounds(89));
    expect(rows[12]?.balance).toBe(0);
    expect(rows[13]?.payment).toBe(0);
  });

  it("recalculates after the inclusive final fixed month, replacing an override", () => {
    const mortgage = {
      ...testInputs().mortgage,
      balance: pounds(2400),
      remainingMonths: 24,
      paymentOverride: pounds(100),
      fixedRate: { until: "2026-12", followOnRate: percent(12) },
    };
    const rows = mortgageProjection(mortgage, today, 24).months;
    expect(rows[1]?.balance).toBe(pounds(2300));
    // 23 months left: £2,300 × .01 / (1 - 1.01^-23) = £112.43743213.
    expect(rows[2]?.interest).toBe(pounds(23));
    expect(rows[2]?.payment).toBe(pounds(112.44));
    expect(rows[24]?.balance).toBe(0);
  });

  it("shortens the term or reduces the payment after a one-off overpayment", () => {
    const mortgage = {
      ...testInputs().mortgage,
      oneOffOverpayments: [{ month: "2026-12", amount: pounds(550) }],
    };
    const shorter = mortgageProjection(mortgage, today, 12).months;
    const lower = mortgageProjection(
      { ...mortgage, overpaymentMode: "lower-payment" },
      today,
      12,
    ).months;
    expect(shorter[1]?.balance).toBe(pounds(550));
    expect(shorter[2]?.payment).toBe(pounds(100));
    expect(shorter[7]?.balance).toBe(0);
    expect(lower[2]?.payment).toBe(pounds(50));
    expect(lower[11]?.balance).toBe(pounds(50));
    expect(lower[12]?.balance).toBe(0);
  });

  it("counts only actual extras and resets the allowance using each year's opening balance", () => {
    const mortgage = {
      ...testInputs().mortgage,
      balance: pounds(24000),
      remainingMonths: 240,
      fixedRate: { until: "2028-11", followOnRate: percent(0) },
      monthlyOverpayment: pounds(200),
    };
    const warnings = mortgageProjection(mortgage, today, 25).warnings;
    // Year 1: £2,400 overpayments = 10% of £24,000. Year 2 starts at £20,400.
    expect(warnings).toEqual([
      {
        kind: "overpayment-allowance-exceeded",
        from: "2027-12",
        until: "2028-11",
        allowance: pounds(2040),
        overpayments: pounds(2400),
        excess: pounds(360),
      },
    ]);
    const repaid = mortgageProjection(
      { ...mortgage, balance: pounds(100), monthlyOverpayment: pounds(1000) },
      today,
      24,
    );
    expect(repaid.months[1]?.overpayment).toBe(pounds(99.58));
  });

  it("warns at maturity for an underpaying override and continues regular payments", () => {
    const projection = mortgageProjection(
      { ...testInputs().mortgage, paymentOverride: pounds(50) },
      today,
      24,
    );
    expect(projection.warnings).toEqual([
      { kind: "mortgage-unpaid-at-term", month: "2027-11", balance: pounds(600) },
    ]);
    expect(projection.months[13]?.payment).toBe(pounds(50));
    expect(projection.months[24]?.balance).toBe(0);
  });

  it("returns a field problem with the minimum override and keeps the defensive throw", () => {
    const mortgage = {
      ...testInputs().mortgage,
      rate: percent(12),
      paymentOverride: pounds(11.99),
    };
    // £1,200 × 12% / 12 = £12 in the first month.
    expect(paymentOverrideProblem(mortgage, today)).toEqual({
      kind: "payment-below-interest",
      minimumPayment: pounds(12),
    });
    expect(() => mortgageProjection(mortgage, today, 12)).toThrow("cover interest");
    expect(paymentOverrideProblem({ ...mortgage, paymentOverride: pounds(12) }, today)).toBeNull();
    expect(paymentOverrideProblem({ ...mortgage, paymentOverride: null }, today)).toBeNull();
    expect(paymentOverrideProblem({ ...mortgage, balance: pounds(0) }, today)).toBeNull();
  });

  it("validates the follow-on rate for an expired fix and ignores an override replaced next month", () => {
    const mortgage = {
      ...testInputs().mortgage,
      rate: percent(0),
      paymentOverride: pounds(1),
      fixedRate: { until: "2026-10", followOnRate: percent(12) },
    };
    expect(paymentOverrideProblem(mortgage, today)).toEqual({
      kind: "payment-below-interest",
      minimumPayment: pounds(12),
    });
    mortgage.fixedRate.until = today;
    expect(paymentOverrideProblem(mortgage, today)).toBeNull();
    expect(() => mortgageProjection(mortgage, today, 12)).not.toThrow();
  });

  it("fails on insufficient interest coverage and unsafe arithmetic", () => {
    expect(() =>
      mortgageProjection(
        { ...testInputs().mortgage, rate: percent(12), paymentOverride: pounds(1) },
        today,
        12,
      ),
    ).toThrow("cover interest");
    expect(() => annuityPayment(pounds(1000), percent(4), 0)).toThrow();
    expect(() => asPence(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });
});
