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

export type TakeHomeFlag =
  /** Adjusted net income is where the personal allowance is being withdrawn. */
  | {
      readonly kind: "sixty-percent-band";
      readonly adjustedNetIncome: Pence;
      /** The extra gross pension contribution that brings adjusted net income to the threshold. */
      readonly extraPensionToExit: Pence;
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

export type LoanOutcome =
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
  /** Empty when the outcome is unknown for lack of a balance. */
  readonly points: readonly LoanPoint[];
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
