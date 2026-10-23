import { fraction, sum } from "./arithmetic.ts";
import type { Contribution, PensionMethod, StudentLoanPlan } from "./inputs.ts";
import { marginalEmployeeNiRate, type NiRates } from "./ni.ts";
import type { MonthPay } from "./pay.ts";
import { flatRate, marginalRate, taxPosition } from "./paye.ts";
import type { MarginalRates, TaxCode } from "./result.ts";
import type { IncomeTaxBands, Rate } from "./rules/types.ts";
import { marginalStudentLoanRates, type StudentLoanRules } from "./student-loan-repayments.ts";

/**
 * Where the next £1 of salary or bonus goes. These are worked out from the rates at each month's
 * position rather than by adding £1 and comparing, which rounding (student loans in whole pounds,
 * tax on whole pounds of pay) would make jumpy.
 *
 * - Salary is spread across the year, so its NI and student loan rates are the average over the
 *   months; the bonus only touches the bonus month.
 * - On a cumulative code the year's tax depends on pay to date at the end of the year, so the
 *   next £1 of either is taxed at the rate at that position. On a non-cumulative code it's the
 *   rate within each month.
 * - Where the code was derived from a tapered allowance, the extra income also withdraws
 *   allowance, which is then taxed at the same rate.
 */

export interface MarginalContext {
  readonly months: readonly MonthPay[];
  readonly bonusMonth: number;
  readonly code: TaxCode;
  readonly bands: IncomeTaxBands;
  /** The allowance taper rate if the code was derived and the allowance is being withdrawn. */
  readonly taperRate: Rate | null;
  readonly niRates: NiRates;
  readonly plans: readonly StudentLoanPlan[];
  readonly studentLoanRules: StudentLoanRules;
  readonly method: PensionMethod;
  readonly reliefAtSourceRate: Rate;
  readonly niableFractionOfSacrifice: number;
}

function share(contribution: Contribution): number {
  switch (contribution.kind) {
    case "percent":
      return contribution.percent / 100;
    case "annual":
      return 0;
  }
}

function taxRateInMonth(context: MarginalContext, month: MonthPay): number {
  const { code, bands } = context;
  switch (code.kind) {
    case "no-tax":
      return 0;
    case "flat":
      return fraction(flatRate(bands, code.bandsAboveBasic));
    case "allowance":
    case "k": {
      if (code.basis === "non-cumulative") {
        const position = taxPosition(code, month.taxablePay, 1);
        return fraction(marginalRate(position.taxableToDate, 1, bands));
      }
      const position = taxPosition(code, sum(context.months.map((m) => m.taxablePay)), 12);
      return fraction(marginalRate(position.taxableToDate, 12, bands));
    }
  }
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function marginalRates(
  context: MarginalContext,
  stream: "salary" | "bonus",
  contribution: Contribution,
): MarginalRates {
  const months =
    stream === "salary"
      ? context.months
      : context.months.filter((month) => month.month === context.bonusMonth);
  if (months.length === 0) {
    throw new Error(`no months for the ${stream}`);
  }
  const pensionShare = share(contribution);
  const { method } = context;
  const taxBase = method === "relief-at-source" ? 1 : 1 - pensionShare;
  const niBase =
    method === "salary-sacrifice" ? 1 - pensionShare * (1 - context.niableFractionOfSacrifice) : 1;
  const adjustedNetIncomeChange = 1 - pensionShare;

  const incomeTax = average(
    months.map((month) => {
      const rate = taxRateInMonth(context, month);
      const taper =
        context.taperRate === null
          ? 0
          : rate * fraction(context.taperRate) * adjustedNetIncomeChange;
      return rate * taxBase + taper;
    }),
  );
  const nationalInsurance = average(
    months.map(
      (month) => fraction(marginalEmployeeNiRate(month.niablePay, context.niRates)) * niBase,
    ),
  );
  const studentLoans = context.plans.map((plan) => ({
    plan,
    percent:
      100 *
      average(
        months.map((month) => {
          const rate = marginalStudentLoanRates(
            month.niablePay,
            context.plans,
            context.studentLoanRules,
          ).find((entry) => entry.plan === plan);
          if (rate === undefined) {
            throw new Error(`no marginal rate for ${plan}`);
          }
          return fraction(rate.rate) * niBase;
        }),
      ),
  }));
  const studentLoansPercent = studentLoans.reduce((total, entry) => total + entry.percent, 0);
  const pension =
    method === "relief-at-source"
      ? pensionShare * (1 - fraction(context.reliefAtSourceRate))
      : pensionShare;
  const totalPercent = 100 * (incomeTax + nationalInsurance + pension) + studentLoansPercent;
  return {
    incomeTaxPercent: 100 * incomeTax,
    nationalInsurancePercent: 100 * nationalInsurance,
    studentLoans,
    studentLoansPercent,
    pensionPercent: 100 * pension,
    takeHomePercent: 100 - totalPercent,
  };
}
