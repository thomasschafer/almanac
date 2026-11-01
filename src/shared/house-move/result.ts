import type { Pence } from "../money.ts";
import type { Month } from "./months.ts";

export type HouseMoveWarning =
  | { readonly kind: "buying-tax-assumed-unchanged" }
  | {
      readonly kind: "overpayment-allowance-exceeded";
      readonly from: Month;
      readonly until: Month;
      readonly allowance: Pence;
      readonly overpayments: Pence;
      readonly excess: Pence;
    }
  | { readonly kind: "mortgage-unpaid-at-term"; readonly month: Month; readonly balance: Pence };

export type MoveDate =
  | { readonly kind: "now"; readonly month: Month }
  | {
      readonly kind: "future";
      readonly month: Month;
      readonly years: number;
      readonly months: number;
      readonly monthsFromToday: number;
    }
  | { readonly kind: "not-within-40-years" };

export interface MonthBreakdown {
  readonly month: Month;
  readonly salePrice: Pence;
  readonly mortgageBalance: Pence;
  readonly mortgagePayment: Pence;
  readonly mortgageInterest: Pence;
  readonly overpayment: Pence;
  readonly earlyRepaymentCharge: Pence;
  readonly exitFee: Pence;
  readonly costs: readonly {
    readonly id: string;
    readonly name: string;
    readonly timing: "completion" | "upfront";
    readonly net: Pence;
    readonly vat: Pence;
    readonly total: Pence;
  }[];
  /** User costs only; buying tax is shown separately and deducted in equityLeft. */
  readonly completionCosts: Pence;
  readonly buyingTax: Pence;
  readonly equityLeft: Pence;
  readonly targetPrice: Pence;
  readonly deposit: Pence;
  readonly newMortgage: Pence;
  readonly savings: Pence;
  readonly savingsLeft: Pence;
  readonly upfrontCosts: Pence;
  readonly upfrontShortfall: Pence;
  readonly available: Pence;
  readonly needed: Pence;
  readonly leftOver: Pence;
  readonly borrowing: {
    readonly income: Pence;
    readonly maximum: Pence;
    readonly sufficient: boolean;
  } | null;
  readonly affordable: boolean;
  /** In pounds of the as-of month, using the same inflation assumption as fixed inputs. */
  readonly todaysMoney: {
    readonly mortgageBalance: Pence;
    readonly buyingTax: Pence;
    readonly completionCosts: Pence;
    readonly savings: Pence;
    readonly upfrontShortfall: Pence;
    readonly earlyRepaymentCharge: Pence;
    readonly exitFee: Pence;
    readonly salePrice: Pence;
    readonly targetPrice: Pence;
    readonly deposit: Pence;
    readonly newMortgage: Pence;
    readonly equityLeft: Pence;
    readonly available: Pence;
    readonly needed: Pence;
    readonly leftOver: Pence;
    readonly upfrontCosts: Pence;
  };
}

export interface HouseMoveCalculation {
  readonly result: MoveDate;
  /** Null when no affordable month exists in the horizon. */
  readonly breakdown: MonthBreakdown | null;
  readonly series: readonly MonthBreakdown[];
  readonly warnings: readonly HouseMoveWarning[];
}
