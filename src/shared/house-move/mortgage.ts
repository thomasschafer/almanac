import { asPence, type Pence } from "../money.ts";
import { annuityPayment, atRate } from "./arithmetic.ts";
import type { HouseMoveInputs } from "./inputs.ts";
import { addMonths, type Month } from "./months.ts";
import type { HouseMoveWarning } from "./result.ts";

type Mortgage = HouseMoveInputs["mortgage"];

export interface PaymentOverrideProblem {
  readonly kind: "payment-below-interest";
  readonly minimumPayment: Pence;
}

/** A validly shaped payment may still fail to cover the interest due. */
export class MortgagePaymentError extends Error {
  readonly minimumPayment: Pence;
  readonly month: Month;

  constructor(minimumPayment: Pence, month: Month) {
    super(
      `Monthly payment must cover interest of £${(minimumPayment / 100).toFixed(2)} in ${month}`,
    );
    this.name = "MortgagePaymentError";
    this.minimumPayment = minimumPayment;
    this.month = month;
  }
}

function initialRate(mortgage: Mortgage, asOf: Month) {
  return mortgage.fixedRate !== null && mortgage.fixedRate.until < asOf
    ? mortgage.fixedRate.followOnRate
    : mortgage.rate;
}

/** The fix ending in the as-of month replaces the override before the next payment is due. */
export function paymentOverrideProblem(
  mortgage: Mortgage,
  asOf: Month,
): PaymentOverrideProblem | null {
  if (mortgage.paymentOverride === null || mortgage.fixedRate?.until === asOf) return null;
  const minimumPayment = atRate(mortgage.balance, initialRate(mortgage, asOf), 120_000);
  return mortgage.paymentOverride < minimumPayment
    ? { kind: "payment-below-interest", minimumPayment }
    : null;
}

export interface MortgageMonth {
  readonly balance: Pence;
  readonly payment: Pence;
  readonly interest: Pence;
  readonly overpayment: Pence;
}

/**
 * Month zero is the supplied balance AFTER the as-of month's payment. Month m is the state
 * after m further monthly payments; a sale in that month redeems that post-payment balance.
 * Allowance years contain payments 1–12, 13–24, etc., using the balance before that group.
 * The fix's `until` month is inclusive. After contractual maturity an underpaid override keeps
 * paying (with interest), rather than inventing an unfunded balloon payment.
 */
export function mortgageProjection(
  mortgage: Mortgage,
  asOf: Month,
  horizon: number,
): { months: MortgageMonth[]; warnings: HouseMoveWarning[] } {
  let balance = mortgage.balance;
  let rate = initialRate(mortgage, asOf);
  let payment = mortgage.paymentOverride ?? annuityPayment(balance, rate, mortgage.remainingMonths);
  let calculatedPayment = mortgage.paymentOverride === null;
  let fixed = mortgage.fixedRate !== null && mortgage.fixedRate.until >= asOf;
  const warnings: HouseMoveWarning[] = [];
  const months: MortgageMonth[] = [
    { balance, payment: asPence(0), interest: asPence(0), overpayment: asPence(0) },
  ];
  let allowance = atRate(balance, mortgage.annualOverpaymentAllowance);
  let overpayments = asPence(0);
  let periodStart = 1;
  function closePeriod(end: number) {
    if (overpayments > allowance)
      warnings.push({
        kind: "overpayment-allowance-exceeded",
        from: addMonths(asOf, periodStart),
        until: addMonths(asOf, end),
        allowance,
        overpayments,
        excess: asPence(overpayments - allowance),
      });
  }
  const problem = paymentOverrideProblem(mortgage, asOf);
  if (problem !== null) throw new MortgagePaymentError(problem.minimumPayment, addMonths(asOf, 1));
  for (let m = 1; m <= horizon; m++) {
    const date = addMonths(asOf, m);
    const remaining = mortgage.remainingMonths - m + 1;
    if (fixed && mortgage.fixedRate !== null && date > mortgage.fixedRate.until) {
      closePeriod(m - 1);
      fixed = false;
      rate = mortgage.fixedRate.followOnRate;
      if (remaining > 0) {
        payment = annuityPayment(balance, rate, remaining);
        calculatedPayment = true;
      }
    }
    if (fixed && m > 1 && (m - 1) % 12 === 0) {
      closePeriod(m - 1);
      periodStart = m;
      allowance = atRate(balance, mortgage.annualOverpaymentAllowance);
      overpayments = asPence(0);
    }
    const interest = atRate(balance, rate, 120_000);
    if (balance > 0 && payment < interest) throw new MortgagePaymentError(interest, date);
    const due = asPence(balance + interest);
    // An annuity's penny rounding must not leave a residual at contractual maturity.
    const paid = asPence(calculatedPayment && remaining === 1 ? due : Math.min(payment, due));
    const maximumExtra = asPence(due - paid);
    const requestedExtra = mortgage.oneOffOverpayments
      .filter((p) => p.month === date)
      .reduce(
        (sum, p) => asPence(Math.min(maximumExtra, sum + p.amount)),
        asPence(Math.min(maximumExtra, mortgage.monthlyOverpayment)),
      );
    const extra = asPence(Math.min(requestedExtra, due - paid));
    balance = asPence(due - paid - extra);
    if (fixed) overpayments = asPence(overpayments + extra);
    months.push({ balance, payment: paid, interest, overpayment: extra });
    if (extra > 0 && mortgage.overpaymentMode === "lower-payment" && remaining > 1) {
      payment = annuityPayment(balance, rate, remaining - 1);
      calculatedPayment = true;
    }
    if (m === mortgage.remainingMonths && balance > 0)
      warnings.push({ kind: "mortgage-unpaid-at-term", month: date, balance });
  }
  if (fixed) closePeriod(horizon);
  return { months, warnings };
}
