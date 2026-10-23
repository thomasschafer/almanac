import { asPence, type Pence } from "../money.ts";
import { itemAt, rateOfDown, sum } from "./arithmetic.ts";
import type { TaxCode } from "./result.ts";
import type { BoundedBand, IncomeTaxBands, Rate } from "./rules/types.ts";

/**
 * Income tax through PAYE for monthly pay, following HMRC's "Specification for PAYE tax table
 * routines" (version 24.0):
 * https://www.gov.uk/government/publications/payroll-technical-specifications-income-tax
 *
 * The specification works to four decimal places of a pound, so this module counts in units of
 * £0.0001 ("u") to keep it exact.
 */

const uPerPound = 10_000;
const uPerPenny = 100;
const monthsInYear = 12;

function checked(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`PAYE arithmetic left the safe integer range: ${String(value)}`);
  }
  return value;
}

function wholePounds(amount: Pence): number {
  if (amount % 100 !== 0) {
    throw new Error(`expected whole pounds: ${String(amount)}`);
  }
  return amount / 100;
}

function inOrder(bands: IncomeTaxBands): BoundedBand[] {
  return [...bands.belowBasic, bands.basic, ...bands.aboveBasic];
}

/** The rate of the flat-rate code that's `bandsAboveBasic` above the basic rate. */
export function flatRate(bands: IncomeTaxBands, bandsAboveBasic: number): Rate {
  const rates = [bands.basic.rate, ...bands.aboveBasic.map((band) => band.rate), bands.top.rate];
  return itemAt(rates, bandsAboveBasic);
}

/** Cumulative band limits (whole pounds) and the cumulative tax at each (u), for a year. */
interface CumulativeBands {
  readonly limits: readonly number[];
  readonly taxAtLimits: readonly number[];
  /** One more than the limits: the last is the top rate. */
  readonly rates: readonly Rate[];
}

function cumulativeBands(bands: IncomeTaxBands): CumulativeBands {
  const limits: number[] = [];
  const taxAtLimits: number[] = [];
  let limit = 0;
  let tax = 0;
  for (const band of inOrder(bands)) {
    const width = wholePounds(band.width);
    limit += width;
    tax = checked(tax + width * band.rate);
    limits.push(limit);
    taxAtLimits.push(tax);
  }
  return {
    limits,
    taxAtLimits,
    rates: [...inOrder(bands).map((band) => band.rate), bands.top.rate],
  };
}

/**
 * Free pay (for suffix codes) or additional pay (for K codes) for one month, from the code's
 * number. Each 500 of the code is £416.67; the rest is (number × £10 + £9) ÷ 12, rounded up to
 * the penny (paragraph 4.3.1).
 */
export function monthlyAdjustment(codeNumber: number): Pence {
  if (!Number.isSafeInteger(codeNumber) || codeNumber < 0) {
    throw new Error(`not a tax code number: ${String(codeNumber)}`);
  }
  if (codeNumber === 0) {
    return asPence(0);
  }
  const quotient = Math.floor((codeNumber - 1) / 500);
  const remainder = ((codeNumber - 1) % 500) + 1;
  const perFiveHundred = Math.ceil((500 * 10 * 100) / monthsInYear);
  return asPence(
    Math.ceil(((remainder * 10 + 9) * 100) / monthsInYear) + quotient * perFiveHundred,
  );
}

/**
 * Tax due to date on taxable pay to date `taxable` after `month` months, on the bands pro-rated
 * to date (paragraph 4.4).
 */
function taxDueToDate(taxable: Pence, month: number, bands: CumulativeBands): Pence {
  if (taxable <= 0) {
    return asPence(0);
  }
  const thresholds = bands.limits.map((limit) =>
    Math.floor(checked(limit * uPerPound * month) / monthsInYear),
  );
  const index = thresholds.findIndex(
    (threshold) => taxable <= Math.ceil(threshold / uPerPound) * 100,
  );
  const band = index === -1 ? thresholds.length : index;
  const threshold = band === 0 ? 0 : itemAt(thresholds, band - 1);
  const taxAtThreshold =
    band === 0
      ? 0
      : Math.floor(checked(itemAt(bands.taxAtLimits, band - 1) * month) / monthsInYear);
  const rate = itemAt(bands.rates, band);
  const roundedTaxable = Math.floor(taxable / 100) * uPerPound;
  const tax = taxAtThreshold + Math.floor(checked((roundedTaxable - threshold) * rate) / 10_000);
  return asPence(Math.floor(tax / uPerPenny));
}

/** All pay to date taxed at one rate, after rounding pay down to the pound (paragraph 5 and 6). */
function flatTaxToDate(pay: Pence, rate: Rate): Pence {
  return rateOfDown(asPence(Math.max(0, Math.floor(pay / 100) * 100)), rate);
}

export interface PayeYear {
  /** Tax deducted each month (negative for a refund). */
  readonly tax: readonly Pence[];
  /** Tax due for the year that the overriding limit stopped payroll taking. */
  readonly notDeducted: Pence;
}

/**
 * Tax deducted each month of the year for monthly taxable pay under `code`. Cumulative codes work
 * on pay to date and can refund; non-cumulative ones treat each month as month 1. For suffix and K
 * codes, no month's deduction can exceed `overridingLimit` of that month's pay (paragraph 4.5.2).
 */
export function payeYear(
  code: TaxCode,
  monthlyTaxablePay: readonly Pence[],
  bands: IncomeTaxBands,
  overridingLimit: Rate,
): PayeYear {
  if (monthlyTaxablePay.length !== monthsInYear) {
    throw new Error(`expected 12 months of pay, got ${String(monthlyTaxablePay.length)}`);
  }
  if (monthlyTaxablePay.some((pay) => pay < 0)) {
    throw new Error("taxable pay can't be negative");
  }
  if (code.kind === "no-tax") {
    return { tax: monthlyTaxablePay.map(() => asPence(0)), notDeducted: asPence(0) };
  }
  const cumulative = code.basis === "cumulative";

  if (code.kind === "flat") {
    const rate = flatRate(bands, code.bandsAboveBasic);
    if (!cumulative) {
      return {
        tax: monthlyTaxablePay.map((pay) => flatTaxToDate(pay, rate)),
        notDeducted: asPence(0),
      };
    }
    let payToDate = 0;
    let paid = 0;
    const tax = monthlyTaxablePay.map((pay) => {
      payToDate += pay;
      const deduction = flatTaxToDate(asPence(payToDate), rate) - paid;
      paid += deduction;
      return asPence(deduction);
    });
    return { tax, notDeducted: asPence(0) };
  }

  const cumulativeTaxBands = cumulativeBands(bands);
  const adjustment = monthlyAdjustment(code.number);
  const taxableToDate = (payToDate: number, month: number) =>
    asPence(code.kind === "k" ? payToDate + adjustment * month : payToDate - adjustment * month);
  const limitFor = (pay: Pence) => rateOfDown(pay, overridingLimit);

  if (!cumulative) {
    let notDeducted = 0;
    const tax = monthlyTaxablePay.map((pay) => {
      const due = taxDueToDate(taxableToDate(pay, 1), 1, cumulativeTaxBands);
      const deduction = Math.min(due, limitFor(pay));
      notDeducted += due - deduction;
      return asPence(deduction);
    });
    return { tax, notDeducted: asPence(notDeducted) };
  }

  let payToDate = 0;
  let paid = 0;
  let due = 0;
  const tax = monthlyTaxablePay.map((pay, index) => {
    payToDate += pay;
    due = taxDueToDate(taxableToDate(payToDate, index + 1), index + 1, cumulativeTaxBands);
    const owed = due - paid;
    const deduction = owed > 0 ? Math.min(owed, limitFor(pay)) : owed;
    paid += deduction;
    return asPence(deduction);
  });
  return { tax, notDeducted: asPence(due - paid) };
}

/**
 * Tax for a whole year on taxable income (after the allowance), with the basic rate band widened
 * by `basicBandExtension` as relief at source contributions do.
 */
export function annualTax(
  taxableIncome: Pence,
  bands: IncomeTaxBands,
  basicBandExtension: Pence = asPence(0),
): Pence {
  if (taxableIncome <= 0) {
    return asPence(0);
  }
  const ordered = inOrder(bands);
  let remaining: number = taxableIncome;
  const parts: Pence[] = [];
  for (const band of ordered) {
    const width = band === bands.basic ? band.width + basicBandExtension : band.width;
    const inBand = Math.min(remaining, width);
    parts.push(rateOfDown(asPence(inBand), band.rate));
    remaining -= inBand;
  }
  parts.push(rateOfDown(asPence(remaining), bands.top.rate));
  return sum(parts);
}

/** The rate the next pound of taxable income to date would be taxed at after `month` months. */
export function marginalRate(taxableToDate: Pence, month: number, bands: IncomeTaxBands): Rate {
  const cumulative = cumulativeBands(bands);
  if (taxableToDate < 0) {
    return 0 as Rate;
  }
  const index = cumulative.limits.findIndex(
    (limit) => taxableToDate < Math.floor((limit * 100 * month) / monthsInYear),
  );
  return itemAt(cumulative.rates, index === -1 ? cumulative.limits.length : index);
}

export interface TaxPosition {
  /** Taxable pay to date after the code's allowance or K adjustment. */
  readonly taxableToDate: Pence;
  readonly month: number;
}

/** Where a code leaves pay to date after `month` months, for marginal rates. */
export function taxPosition(
  code: Extract<TaxCode, { kind: "allowance" | "k" }>,
  payToDate: Pence,
  month: number,
): TaxPosition {
  const adjustment = monthlyAdjustment(code.number) * month;
  return {
    taxableToDate: asPence(code.kind === "k" ? payToDate + adjustment : payToDate - adjustment),
    month,
  };
}
