import { fromPounds as pounds, type Pence } from "../../money.ts";
import type { PlanWithOlderLoans, StudentLoanPlan } from "../inputs.ts";
import { confirmed, percent, provisional, type Rate, type Sourced } from "./types.ts";

/**
 * Student loan rules that aren't tied to one tax year: interest, write-off and how repayment
 * thresholds are expected to change in years whose rules aren't known yet.
 */

const writeOffPage =
  "https://www.gov.uk/repaying-your-student-loan/when-your-student-loan-gets-written-off-or-cancelled";
const interestPage = "https://www.gov.uk/repaying-your-student-loan/what-you-pay";
const announcement2026 =
  "https://www.gov.uk/government/news/student-loans-interest-rates-and-repayment-threshold-announcement--7";
const repaymentRegulations = "https://www.legislation.gov.uk/uksi/2022/1335/regulation/65/made";
const budget2025 =
  "https://www.gov.uk/government/publications/budget-2025-document/budget-2025-html";

/** Plan 2 and Postgraduate Loan interest is capped at 6%, announced for one academic year. */
const capNote =
  "The 6% cap is announced for the 2026/27 academic year, to 31 August 2027. Continuing it " +
  "after then is a modelling assumption.";

export type InterestRule =
  /** The lower of RPI and Bank Rate plus a margin. */
  | { readonly kind: "lower-of-rpi-and-bank-rate"; readonly bankRateMargin: Rate }
  | { readonly kind: "rpi" }
  | { readonly kind: "rpi-plus"; readonly margin: Rate; readonly cap: Rate | null }
  /**
   * RPI at or below the lower income threshold, rising on a straight line to RPI plus `maxMargin`
   * at the upper income threshold, then capped.
   */
  | { readonly kind: "income-linked"; readonly maxMargin: Rate; readonly cap: Rate | null };

export type ThresholdUprating =
  /** Last year's threshold times one plus RPI, rounded up to a multiple of `roundUpTo`. */
  | { readonly kind: "rpi"; readonly roundUpTo: Pence }
  /** Held at its value up to and including the tax year starting in `frozenThroughStartYear`. */
  | {
      readonly kind: "frozen-then-rpi";
      readonly frozenThroughStartYear: number;
      readonly roundUpTo: Pence;
    }
  | { readonly kind: "fixed" };

/** An interest rule that doesn't depend on income. */
export type FlatInterestRule = Exclude<InterestRule, { kind: "income-linked" }>;

export interface StudentLoanPlanRules {
  readonly name: string;
  /** Written off this many years after the April the borrower was first due to repay. */
  readonly writeOffYears: Sourced<number>;
  /** Once repayments are due. */
  readonly interest: Sourced<InterestRule>;
  /**
   * Before 6 April of the year repayments are first due, if that differs from `interest`. An
   * income-linked rate needs the year's income, so a plan with one needs a rule for before then.
   */
  readonly interestBeforeRepaymentsDue: Sourced<FlatInterestRule> | null;
  readonly thresholdUprating: Sourced<ThresholdUprating>;
}

const roundUpToFivePounds = pounds(5);

export const studentLoanPlanRules: Readonly<Record<StudentLoanPlan, StudentLoanPlanRules>> = {
  plan1: {
    name: "Plan 1",
    writeOffYears: confirmed(
      25,
      writeOffPage,
      "For loans first paid on or after 1 September 2006; earlier loans are on older terms.",
    ),
    interest: confirmed(
      { kind: "lower-of-rpi-and-bank-rate", bankRateMargin: percent(1) },
      announcement2026,
    ),
    interestBeforeRepaymentsDue: null,
    thresholdUprating: confirmed(
      { kind: "rpi", roundUpTo: roundUpToFivePounds },
      repaymentRegulations,
    ),
  },
  plan2: {
    name: "Plan 2",
    writeOffYears: confirmed(30, writeOffPage),
    interest: provisional(
      { kind: "income-linked", maxMargin: percent(3), cap: percent(6) },
      announcement2026,
      capNote,
    ),
    interestBeforeRepaymentsDue: provisional(
      { kind: "rpi-plus", margin: percent(3), cap: percent(6) },
      interestPage,
      "RPI + 3% while studying, until the rate becomes income-linked on 6 April after leaving " +
        "the course, taken as the April repayments are first due. " +
        capNote,
    ),
    thresholdUprating: provisional(
      { kind: "frozen-then-rpi", frozenThroughStartYear: 2029, roundUpTo: roundUpToFivePounds },
      budget2025,
      "Frozen from 2027/28 to 2029/30 (Budget 2025). The Budget doesn't say how it's uprated " +
        "after that; assumed to return to RPI, as in the repayment regulations.",
    ),
  },
  plan4: {
    name: "Plan 4",
    writeOffYears: confirmed(
      30,
      writeOffPage,
      "For loans first paid on or after 1 August 2007; earlier loans are on older terms.",
    ),
    interest: confirmed(
      { kind: "lower-of-rpi-and-bank-rate", bankRateMargin: percent(1) },
      interestPage,
      "Plan 4 follows the same rule as Plan 1 and is 4.1% for 2026/27.",
    ),
    interestBeforeRepaymentsDue: null,
    thresholdUprating: provisional(
      { kind: "rpi", roundUpTo: roundUpToFivePounds },
      "https://www.legislation.gov.uk/ssi/2012/22/made",
      "Set by the Scottish Government; assumed to keep rising with RPI.",
    ),
  },
  plan5: {
    name: "Plan 5",
    writeOffYears: confirmed(40, writeOffPage),
    interest: confirmed({ kind: "rpi" }, announcement2026),
    interestBeforeRepaymentsDue: null,
    thresholdUprating: confirmed(
      { kind: "rpi", roundUpTo: roundUpToFivePounds },
      repaymentRegulations,
    ),
  },
  postgraduate: {
    name: "Postgraduate Loan",
    writeOffYears: confirmed(30, writeOffPage),
    interest: provisional(
      { kind: "rpi-plus", margin: percent(3), cap: percent(6) },
      announcement2026,
      capNote,
    ),
    interestBeforeRepaymentsDue: null,
    thresholdUprating: confirmed(
      { kind: "fixed" },
      repaymentRegulations,
      "The regulations set a flat £21,000 with no uprating.",
    ),
  },
};

/** The write-off terms for Plan 1 and Plan 4 loans first paid before a cutoff date. */
export interface OlderLoanTerms {
  /** YYYY-MM-DD: loans first paid before this date are on these terms. */
  readonly firstPaidBefore: string;
  readonly writeOff:
    /** Written off at this age, with no term in years. */
    | { readonly kind: "at-age"; readonly age: number }
    /** Written off at this age, or after the plan's usual term if that's sooner. */
    | { readonly kind: "at-age-or-term"; readonly age: number };
}

export const olderLoanTerms: Readonly<Record<PlanWithOlderLoans, Sourced<OlderLoanTerms>>> = {
  plan1: confirmed(
    { firstPaidBefore: "2006-09-01", writeOff: { kind: "at-age", age: 65 } },
    writeOffPage,
  ),
  plan4: confirmed(
    { firstPaidBefore: "2007-08-01", writeOff: { kind: "at-age-or-term", age: 65 } },
    writeOffPage,
  ),
};

/**
 * The monthly repayment threshold HMRC publishes is the annual one divided by 12 and truncated to
 * the penny (for example £26,900 gives £2,241.66). Used for years whose monthly figures aren't
 * published yet.
 */
export function monthlyRepaymentThreshold(annual: Pence): Pence {
  return Math.floor(annual / 12) as Pence;
}

/**
 * The interest rates for one academic year (1 September to 31 August), as announced. Interest
 * after the last listed year follows each plan's rule using the assumed RPI.
 */
export interface InterestYear {
  /** YYYY-MM-DD, inclusive. */
  readonly from: string;
  /** YYYY-MM-DD, inclusive. */
  readonly to: string;
  /** RPI for the March before, which sets the year's rates. */
  readonly rpi: Sourced<Rate>;
  readonly plan1: Sourced<Rate>;
  readonly plan4: Sourced<Rate>;
  readonly plan5: Sourced<Rate>;
  readonly postgraduate: Sourced<Rate>;
  /**
   * Plan 2's rate once repayments are due, at or below the lower income threshold and at or above
   * the upper one.
   */
  readonly plan2: Sourced<{ readonly minimum: Rate; readonly maximum: Rate }>;
  /** Plan 2's rate before repayments are due, as while studying. */
  readonly plan2BeforeRepaymentsDue: Sourced<Rate>;
}

export const interestYears: readonly InterestYear[] = [
  {
    from: "2026-09-01",
    to: "2027-08-31",
    rpi: confirmed(percent(4.1), announcement2026),
    plan1: confirmed(percent(4.1), announcement2026, "Lower of RPI and Bank Rate + 1% (4.75%)."),
    plan4: confirmed(percent(4.1), interestPage),
    plan5: confirmed(percent(4.1), announcement2026),
    postgraduate: confirmed(percent(6), announcement2026, "RPI + 3% (7.1%), capped at 6%."),
    plan2: confirmed(
      { minimum: percent(4.1), maximum: percent(6) },
      interestPage,
      "RPI to RPI + 3% (7.1%), capped at 6%.",
    ),
    plan2BeforeRepaymentsDue: confirmed(
      percent(6),
      announcement2026,
      "While studying: RPI + 3% (7.1%), capped at 6%.",
    ),
  },
];

/**
 * Plan 2's interest income thresholds. The lower one is the Plan 2 repayment threshold for the
 * tax year; the upper one is listed here.
 */
export const plan2UpperInterestThreshold: {
  readonly known: Readonly<Record<string, Sourced<Pence>>>;
  readonly uprating: Sourced<ThresholdUprating>;
} = {
  known: {
    "2026-27": confirmed(pounds(52_885), interestPage),
  },
  uprating: provisional(
    { kind: "frozen-then-rpi", frozenThroughStartYear: 2029, roundUpTo: roundUpToFivePounds },
    "https://ifs.org.uk/articles/how-do-plan-2-student-loans-work-and-how-have-they-changed-over-time",
    "The upper threshold (£52,885 for 2026/27) is reported as frozen to 2029/30 alongside the " +
      "repayment threshold, then assumed to rise with RPI; GOV.UK doesn't say.",
  ),
};

/**
 * From April 2029 only the first £2,000 a year of salary-sacrificed pension contributions is
 * expected to be free of NI. Student loan repayments are worked out on the same pay as NI, so the
 * projection applies this from the year it starts.
 */
export const salarySacrificeNiCap: Sourced<{
  readonly fromStartYear: number;
  readonly annualCap: Pence;
}> = provisional(
  { fromStartYear: 2029, annualCap: pounds(2_000) },
  budget2025,
  "Announced at Budget 2025; how the cap applies to each pay period isn't published yet, so " +
    "each month's sacrifice is assumed to be NI-free in proportion to the cap.",
);
