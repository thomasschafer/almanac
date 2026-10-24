import type { Pence } from "../money.ts";
import type { PensionMethod, StudentLoanPlan, TakeHomeInputs } from "./inputs.ts";
import type { TaxRegime } from "./rules/types.ts";

/** Whether tax is worked out on pay to date (normal) or on each month's pay alone (W1, M1, X). */
export type TaxCodeBasis = "cumulative" | "non-cumulative";

/** A parsed PAYE tax code. */
export type TaxCode =
  /** A number and suffix, such as 1257L or S1100T; 0T has no allowance. */
  | {
      readonly kind: "allowance";
      readonly regime: TaxRegime;
      readonly number: number;
      readonly suffix: "L" | "M" | "N" | "T";
      readonly basis: TaxCodeBasis;
    }
  /** Untaxed income that's added to pay, such as K500. */
  | {
      readonly kind: "k";
      readonly regime: TaxRegime;
      readonly number: number;
      readonly basis: TaxCodeBasis;
    }
  /**
   * All pay taxed at one band's rate: BR (basic), or D0, D1 and the Scottish SD0 to SD3 for the
   * bands above it. `bandsAboveBasic` is 0 for BR, 1 for D0, 2 for D1 and so on.
   */
  | {
      readonly kind: "flat";
      readonly regime: TaxRegime;
      readonly bandsAboveBasic: number;
      readonly basis: TaxCodeBasis;
    }
  | { readonly kind: "no-tax"; readonly basis: TaxCodeBasis };

export type TaxCodeUsed =
  | {
      readonly source: "derived";
      readonly code: TaxCode;
      /** The code as HMRC would write it, such as "1257L". */
      readonly display: string;
      readonly allowance: "full" | "tapered" | "none";
    }
  | { readonly source: "override"; readonly code: TaxCode; readonly display: string };

export interface StudentLoanDeduction {
  readonly plan: StudentLoanPlan;
  readonly amount: Pence;
}

/** Money into the pension, by method. `employee` is the gross amount you contribute. */
export type PensionBreakdown =
  | {
      readonly method: Extract<PensionMethod, "salary-sacrifice">;
      readonly employee: Pence;
      readonly employer: Pence;
      /** The share of the employer's NI saving they add. */
      readonly employerNiPassOn: Pence;
      readonly total: Pence;
    }
  | {
      readonly method: Extract<PensionMethod, "net-pay">;
      readonly employee: Pence;
      readonly employer: Pence;
      readonly total: Pence;
    }
  | {
      readonly method: Extract<PensionMethod, "relief-at-source">;
      readonly employee: Pence;
      /** What comes out of net pay: the gross contribution less basic-rate relief. */
      readonly paidFromNetPay: Pence;
      /** Basic-rate relief the provider adds. */
      readonly providerTopUp: Pence;
      readonly employer: Pence;
      readonly total: Pence;
    };

/** A month's or a year's pay. netPay = grossPay − salarySacrifice − pension taken from pay − tax − NI − student loans. */
export interface PayBreakdown {
  readonly salary: Pence;
  readonly bonus: Pence;
  readonly grossPay: Pence;
  /** Pay given up for pension contributions (salary sacrifice only). */
  readonly salarySacrifice: Pence;
  readonly pension: PensionBreakdown;
  /** Pay that NI and student loan repayments are worked out on. */
  readonly niablePay: Pence;
  /** Pay that income tax is worked out on, before the allowance. */
  readonly taxablePay: Pence;
  readonly incomeTax: Pence;
  readonly nationalInsurance: Pence;
  readonly employerNationalInsurance: Pence;
  /** One entry per plan, in the order of the inputs. */
  readonly studentLoans: readonly StudentLoanDeduction[];
  readonly studentLoanTotal: Pence;
  readonly netPay: Pence;
}

export interface MonthResult extends PayBreakdown {
  /** The month of the tax year: 1 is April, 12 is March. */
  readonly month: number;
  readonly isBonusMonth: boolean;
}

/** Percentages of gross pay. */
export interface EffectiveRates {
  readonly incomeTaxPercent: number;
  readonly nationalInsurancePercent: number;
  readonly studentLoansPercent: number;
  readonly totalPercent: number;
}

/** Where the next £1 goes, as percentages of that £1. */
export interface MarginalRates {
  readonly incomeTaxPercent: number;
  readonly nationalInsurancePercent: number;
  readonly studentLoans: readonly { readonly plan: StudentLoanPlan; readonly percent: number }[];
  readonly studentLoansPercent: number;
  /** Taken from pay into the pension. */
  readonly pensionPercent: number;
  readonly takeHomePercent: number;
}

export interface AnnualAllowanceCheck {
  readonly standardAllowance: Pence;
  /** After any taper. */
  readonly allowance: Pence;
  readonly tapered: boolean;
  readonly thresholdIncome: Pence;
  readonly adjustedIncome: Pence;
  /** Everything paid into the pension in the year: yours, your employer's and any top-up. */
  readonly pensionInput: Pence;
  readonly excess: Pence;
}

export interface ProvisionalFigure {
  readonly label: string;
  readonly note: string;
  readonly source: string;
}

/**
 * An extra pension contribution: the gross amount going in, and for relief at source, the part
 * of it that comes from net pay (the provider adds the rest).
 */
export type ExtraPension =
  | {
      readonly method: Extract<PensionMethod, "salary-sacrifice" | "net-pay">;
      readonly gross: Pence;
    }
  | {
      readonly method: Extract<PensionMethod, "relief-at-source">;
      readonly gross: Pence;
      readonly paidFromNetPay: Pence;
    };

export type TakeHomeFlag =
  /** Adjusted net income is where the personal allowance is being withdrawn. */
  | {
      readonly kind: "allowance-taper";
      readonly adjustedNetIncome: Pence;
      /** Adjusted net income where the allowance starts to be withdrawn, and where it's all gone. */
      readonly band: { readonly from: Pence; readonly to: Pence };
      /**
       * Income tax on the next £1 of adjusted net income, as a percentage: the band's rate on the
       * £1 itself and on the allowance it withdraws.
       */
      readonly effectiveRatePercent: number;
      /** The extra pension contribution that brings adjusted net income down to the threshold. */
      readonly extraPensionToExit: ExtraPension;
    }
  | {
      readonly kind: "annual-allowance-exceeded";
      readonly pensionInput: Pence;
      readonly allowance: Pence;
      readonly excess: Pence;
      readonly tapered: boolean;
    }
  | { readonly kind: "provisional-figures"; readonly figures: readonly ProvisionalFigure[] }
  /** The tax code override is for a different regime from the region chosen. */
  | {
      readonly kind: "tax-code-region-mismatch";
      readonly codeRegime: TaxRegime;
      readonly region: TakeHomeInputs["region"];
    }
  /** Loans nothing is taken for this year, and why. */
  | {
      readonly kind: "student-loans-not-taken";
      readonly loans: readonly {
        readonly plan: StudentLoanPlan;
        readonly reason:
          | { readonly kind: "not-due"; readonly firstRepaymentYear: number }
          /** A balance of £0 means there's nothing left to repay. */
          | { readonly kind: "repaid" };
      }[];
    }
  /** The K-code overriding limit stopped some tax being taken through payroll. */
  | { readonly kind: "tax-not-deducted"; readonly amount: Pence };

export type InputIssue =
  | { readonly kind: "invalid-tax-code"; readonly input: string; readonly message: string }
  | {
      readonly kind: "pension-exceeds-pay";
      readonly from: "salary" | "bonus";
      readonly message: string;
    }
  | { readonly kind: "negative-net-pay"; readonly month: number; readonly message: string };

export interface TakeHomeCalculation {
  readonly status: "ok";
  readonly taxYear: string;
  readonly region: TakeHomeInputs["region"];
  readonly taxCode: TaxCodeUsed;
  /** April to March. */
  readonly months: readonly MonthResult[];
  /** The most common non-bonus month; ties go to the earliest. */
  readonly normalMonth: MonthResult;
  /** Null when there's no bonus. */
  readonly bonusMonth: MonthResult | null;
  /** Net pay can drift between non-bonus months, such as after a bonus on a cumulative code. */
  readonly nonBonusNetPayRange: { readonly min: Pence; readonly max: Pence };
  readonly annual: PayBreakdown;
  /**
   * Tax due for the year that payroll couldn't take because of the overriding limit (K codes),
   * which HMRC collects another way.
   */
  readonly incomeTaxNotDeducted: Pence;
  /** Relief at source only: relief beyond the provider's top-up, claimed through Self Assessment. */
  readonly reliefAtSourceClaimable: Pence | null;
  readonly adjustedNetIncome: Pence;
  readonly personalAllowance: {
    readonly full: Pence;
    readonly afterTaper: Pence;
  };
  /** Null when there's no gross pay. */
  readonly effectiveRates: EffectiveRates | null;
  readonly marginalRates: { readonly salary: MarginalRates; readonly bonus: MarginalRates };
  readonly annualAllowance: AnnualAllowanceCheck;
  readonly flags: readonly TakeHomeFlag[];
}

export interface TakeHomeInvalid {
  readonly status: "invalid";
  readonly issues: readonly InputIssue[];
}

export type TakeHomeResult = TakeHomeCalculation | TakeHomeInvalid;

/** A loan's balance at a point in the projection, for the chart. */
export interface LoanPoint {
  /** YYYY-MM-DD: the projection start, then each 5 April, then the date it ends. */
  readonly date: string;
  /** The tax year the point falls in or closes. */
  readonly taxYear: string;
  readonly balance: Pence;
  /** Repaid and interest added since the previous point. */
  readonly repaid: Pence;
  readonly interest: Pence;
}

/** One month of a loan's projection. */
export interface LoanMonth {
  /** YYYY-MM-DD: the end of the pay month (the 5th of the next calendar month). */
  readonly date: string;
  readonly taxYear: string;
  /** The month's pay that repayments are worked out on. */
  readonly pay: Pence;
  /** The yearly rate interest was added at this month. */
  readonly interestRatePercent: number;
  readonly interest: Pence;
  readonly repaid: Pence;
  /** After this month's interest and repayment. */
  readonly balance: Pence;
}

export type LoanOutcome =
  /** The balance is already 0. */
  | { readonly kind: "already-repaid" }
  | { readonly kind: "repaid"; readonly date: string }
  | { readonly kind: "written-off"; readonly date: string; readonly balanceWrittenOff: Pence }
  /** No balance, so nothing can be projected. */
  | { readonly kind: "unknown"; readonly missing: "balance" }
  /**
   * No first repayment year, so the write-off date isn't known. `repaidBy` says when it would be
   * repaid if it isn't written off first, or null if not within the horizon.
   */
  | {
      readonly kind: "unknown";
      readonly missing: "first-repayment-year";
      readonly repaidBy: string | null;
    }
  /** Still outstanding at the end of the horizon, with the write-off date beyond it. */
  | { readonly kind: "outstanding"; readonly horizonEnd: string; readonly balance: Pence };

export interface LoanProjection {
  readonly plan: StudentLoanPlan;
  readonly name: string;
  readonly outcome: LoanOutcome;
  /**
   * The 6 April repayments start on (YYYY-MM-DD), when that's after the projection starts. Interest
   * is still added until then.
   */
  readonly repaymentsStart: string | null;
  /** Empty when there's no balance to chart: it's unknown, or already repaid. */
  readonly points: readonly LoanPoint[];
  /** Every projected month, also empty without a balance to chart. */
  readonly months: readonly LoanMonth[];
  readonly totalRepaid: Pence;
  readonly totalInterest: Pence;
}

export type StudentLoanProjection =
  | {
      readonly status: "ok";
      readonly start: string;
      readonly loans: readonly LoanProjection[];
      /** Across loans with a known balance. */
      readonly totalRepaid: Pence;
      readonly totalInterest: Pence;
      /** Assumptions behind the projection, to show alongside it. */
      readonly assumptions: readonly string[];
    }
  /** The start date falls in a tax year with no rules. */
  | { readonly status: "no-rules"; readonly taxYear: string }
  /** The pay can't be projected for a year, such as a fixed pension amount above a falling salary. */
  | {
      readonly status: "invalid";
      readonly taxYear: string;
      readonly issues: readonly InputIssue[];
    };
