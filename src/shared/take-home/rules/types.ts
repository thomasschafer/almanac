import type { Pence } from "../../money.ts";
import type { Rate } from "../../rates.ts";
import type { Sourced } from "../../sourced.ts";
import type { StudentLoanPlan } from "../inputs.ts";

/** A threshold as published for a year and for a monthly pay period. */
export interface PeriodThreshold {
  readonly annual: Pence;
  readonly monthly: Pence;
}

/** A tax band with an upper limit, as a width of taxable income. */
export interface BoundedBand {
  readonly name: string;
  readonly rate: Rate;
  readonly width: Pence;
}

export interface TopBand {
  readonly name: string;
  readonly rate: Rate;
}

/**
 * A regime's income tax bands, in ascending order of rate, applied to taxable income (income above
 * the allowance). The basic rate band is singled out because flat-rate codes (BR, D0, SD0 and so
 * on) and relief at source are defined relative to it.
 */
export interface IncomeTaxBands {
  readonly belowBasic: readonly BoundedBand[];
  readonly basic: BoundedBand;
  readonly aboveBasic: readonly BoundedBand[];
  readonly top: TopBand;
}

/**
 * The income tax regime a tax code applies. Codes without a prefix use the rates for England and
 * Northern Ireland; an S prefix means Scottish rates and a C prefix Welsh rates.
 */
export const taxRegimes = ["rest-of-uk", "scotland", "wales"] as const;
export type TaxRegime = (typeof taxRegimes)[number];

export type SalarySacrificeNiRelief =
  /** All salary-sacrificed pension contributions are free of NI. */
  | { readonly kind: "unlimited" }
  /** Only the first `annualCap` a year of sacrificed pension contributions is free of NI. */
  | { readonly kind: "capped"; readonly annualCap: Pence };

export interface StudentLoanYearRules {
  readonly threshold: Sourced<PeriodThreshold>;
  readonly rate: Sourced<Rate>;
}

/** Everything the engine needs to work out pay for one tax year. */
export interface TaxYearRules {
  /** Such as "2026-27". */
  readonly id: string;
  /** The calendar year the tax year starts in, on 6 April. */
  readonly startYear: number;
  /** The date (YYYY-MM-DD) these rules were last checked against their sources. */
  readonly lastReviewed: string;
  readonly incomeTax: {
    readonly personalAllowance: Sourced<Pence>;
    /** Adjusted net income above which the personal allowance is withdrawn. */
    readonly taperThreshold: Sourced<Pence>;
    /** The share of adjusted net income above the threshold by which the allowance is reduced. */
    readonly taperRate: Sourced<Rate>;
    readonly bands: Readonly<Record<TaxRegime, Sourced<IncomeTaxBands>>>;
    /** The most PAYE can deduct in one pay period, as a share of that period's pay. */
    readonly overridingLimit: Sourced<Rate>;
  };
  readonly nationalInsurance: {
    readonly primaryThreshold: Sourced<PeriodThreshold>;
    readonly upperEarningsLimit: Sourced<PeriodThreshold>;
    /** Employee rate between the primary threshold and the upper earnings limit. */
    readonly mainRate: Sourced<Rate>;
    /** Employee rate above the upper earnings limit. */
    readonly upperRate: Sourced<Rate>;
    readonly secondaryThreshold: Sourced<PeriodThreshold>;
    readonly employerRate: Sourced<Rate>;
    readonly salarySacrificeRelief: Sourced<SalarySacrificeNiRelief>;
  };
  readonly studentLoans: Readonly<Record<StudentLoanPlan, StudentLoanYearRules>>;
  readonly pensions: {
    readonly annualAllowance: Sourced<Pence>;
    readonly annualAllowanceTaper: Sourced<{
      /** The taper only applies when threshold income is above this... */
      readonly thresholdIncome: Pence;
      /** ...and adjusted income is above this. */
      readonly adjustedIncome: Pence;
      /** The share of adjusted income above the limit by which the allowance is reduced. */
      readonly rate: Rate;
      readonly minimumAllowance: Pence;
    }>;
    /** The rate a relief at source provider adds to the member's net contribution. */
    readonly reliefAtSourceRate: Sourced<Rate>;
  };
}
