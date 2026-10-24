import { asPence, type Pence } from "../money.ts";
import { itemAt, sum } from "./arithmetic.ts";
import {
  hasOlderTerms,
  type FirstPaid,
  type StudentLoanPlan,
  type TakeHomeInputs,
} from "./inputs.ts";
import { payYear, type MonthPay } from "./pay.ts";
import type {
  LoanMonth,
  LoanOutcome,
  LoanPoint,
  LoanProjection,
  StudentLoanProjection,
} from "./result.ts";
import {
  findTaxYearRules,
  startYearOfTaxYear,
  taxYearId,
  type TaxYearRegistry,
} from "./rules/registry.ts";
import { taxYearStartYearOf, ukDate } from "./rules/review.ts";
import {
  interestYears,
  monthlyRepaymentThreshold,
  olderLoanTerms,
  plan2UpperInterestThreshold,
  salarySacrificeNiCap,
  studentLoanPlanRules,
  type InterestRule,
  type InterestYear,
  type OlderLoanTerms,
  type ThresholdUprating,
} from "./rules/student-loans.ts";
import {
  provisional,
  type Rate,
  type SalarySacrificeNiRelief,
  type StudentLoanYearRules,
  type TaxYearRules,
} from "./rules/types.ts";
import {
  repaymentsDue,
  studentLoanRepayments,
  type StudentLoanRules,
} from "./student-loan-repayments.ts";

/** How far ahead to look when a loan has no write-off date. */
const horizonYears = 60;

/** What the projection needs for one tax year. */
interface ProjectionYear {
  readonly studentLoans: StudentLoanRules;
  readonly salarySacrificeNiRelief: SalarySacrificeNiRelief;
  readonly reliefAtSourceRate: Rate;
  readonly plan2UpperInterestThreshold: Pence;
}

export function uprate(
  previous: Pence,
  rule: ThresholdUprating,
  startYear: number,
  rpiPercent: number,
): Pence {
  switch (rule.kind) {
    case "fixed":
      return previous;
    case "frozen-then-rpi":
      if (startYear <= rule.frozenThroughStartYear) {
        return previous;
      }
      return uprate(previous, { kind: "rpi", roundUpTo: rule.roundUpTo }, startYear, rpiPercent);
    case "rpi": {
      const raised = (previous * (100 + rpiPercent)) / 100;
      // Guard against floating point putting an exact multiple just above itself.
      return asPence(Math.ceil(raised / rule.roundUpTo - 1e-9) * rule.roundUpTo);
    }
  }
}

/**
 * The rules for each tax year of the projection: the registry's where it has them, and after the
 * latest known year, that year's rules with thresholds uprated by each plan's rule.
 */
function projectionYears(registry: TaxYearRegistry, rpiPercent: number) {
  const latest = registry.at(-1);
  if (latest === undefined) {
    throw new Error("the tax year registry is empty");
  }
  const latestStartYear = latest.startYear;
  const cache = new Map<number, ProjectionYear>();
  const plan2Upper = (previous: ProjectionYear, startYear: number) =>
    uprate(
      previous.plan2UpperInterestThreshold,
      plan2UpperInterestThreshold.uprating.value,
      startYear,
      rpiPercent,
    );

  const known = (rules: TaxYearRules): ProjectionYear => {
    const upper =
      plan2UpperInterestThreshold.known[rules.id]?.value ??
      plan2Upper(yearFor(rules.startYear - 1), rules.startYear);
    return {
      studentLoans: rules.studentLoans,
      salarySacrificeNiRelief: rules.nationalInsurance.salarySacrificeRelief.value,
      reliefAtSourceRate: rules.pensions.reliefAtSourceRate.value,
      plan2UpperInterestThreshold: upper,
    };
  };

  const projected = (startYear: number): ProjectionYear => {
    const previous = yearFor(startYear - 1);
    const note = `Projected from ${latest.id} with RPI at ${String(rpiPercent)}%.`;
    const uprated = (plan: StudentLoanPlan): StudentLoanYearRules => {
      const { thresholdUprating } = studentLoanPlanRules[plan];
      const before = previous.studentLoans[plan];
      const annual = uprate(
        before.threshold.value.annual,
        thresholdUprating.value,
        startYear,
        rpiPercent,
      );
      return {
        threshold: provisional(
          { annual, monthly: monthlyRepaymentThreshold(annual) },
          thresholdUprating.source,
          note,
        ),
        rate: before.rate,
      };
    };
    const cap = salarySacrificeNiCap.value;
    return {
      studentLoans: {
        plan1: uprated("plan1"),
        plan2: uprated("plan2"),
        plan4: uprated("plan4"),
        plan5: uprated("plan5"),
        postgraduate: uprated("postgraduate"),
      },
      salarySacrificeNiRelief:
        startYear >= cap.fromStartYear
          ? { kind: "capped", annualCap: cap.annualCap }
          : previous.salarySacrificeNiRelief,
      reliefAtSourceRate: previous.reliefAtSourceRate,
      plan2UpperInterestThreshold: plan2Upper(previous, startYear),
    };
  };

  function yearFor(startYear: number): ProjectionYear {
    const cached = cache.get(startYear);
    if (cached !== undefined) {
      return cached;
    }
    const rules = findTaxYearRules(registry, taxYearId(startYear));
    if (rules === undefined && startYear <= latestStartYear) {
      throw new Error(
        `no rules for ${taxYearId(startYear)}, which is before the latest known year`,
      );
    }
    const year = rules === undefined ? projected(startYear) : known(rules);
    cache.set(startYear, year);
    return year;
  }
  return yearFor;
}

function interestYearFor(date: string): InterestYear | undefined {
  return interestYears.find((year) => year.from <= date && date <= year.to);
}

function plan2Rate(
  rpi: number,
  rule: Extract<InterestRule, { kind: "income-linked" }>,
  income: Pence,
  lower: Pence,
  upper: Pence,
): number {
  const share = upper <= lower ? 1 : Math.min(1, Math.max(0, (income - lower) / (upper - lower)));
  return capped(rpi + (rule.maxMargin / 100) * share, rule.cap);
}

/** Where a loan is in its life, which sets the interest rule that applies. */
export type InterestPeriod =
  /** Before 6 April of the year repayments are first due. */
  | { readonly kind: "before-repayments-due" }
  /** Plan 2's income-linked rate needs the tax year's income and its interest thresholds. */
  | {
      readonly kind: "repayments-due";
      readonly plan2: { readonly income: Pence; readonly lower: Pence; readonly upper: Pence };
    };

function capped(rate: number, cap: Rate | null): number {
  return cap === null ? rate : Math.min(rate, cap / 100);
}

/** The annual interest rate as a percentage for a plan in a month starting on `date`. */
export function interestRate(
  plan: StudentLoanPlan,
  date: string,
  rpiPercent: number,
  period: InterestPeriod,
): number {
  const rules = studentLoanPlanRules[plan];
  const before = period.kind === "before-repayments-due" ? rules.interestBeforeRepaymentsDue : null;
  const rule: InterestRule = before?.value ?? rules.interest.value;
  const known = interestYearFor(date);
  const rpi = known === undefined ? rpiPercent : known.rpi.value / 100;
  if (rule.kind === "income-linked") {
    if (period.kind !== "repayments-due") {
      throw new Error(`${rules.name} has no interest rule for before repayments are due`);
    }
    const { income, lower, upper } = period.plan2;
    const rate = plan2Rate(rpi, rule, income, lower, upper);
    if (known !== undefined) {
      const { minimum, maximum } = known.plan2.value;
      if (rate < minimum / 100 - 1e-9 || rate > maximum / 100 + 1e-9) {
        throw new Error(`Plan 2 interest ${String(rate)}% is outside the announced range`);
      }
    }
    return rate;
  }
  if (known !== undefined) {
    switch (plan) {
      case "plan1":
      case "plan4":
      case "plan5":
      case "postgraduate":
        return known[plan].value / 100;
      case "plan2":
        if (before === null) {
          throw new Error("Plan 2 interest is income-linked once repayments are due");
        }
        return known.plan2BeforeRepaymentsDue.value / 100;
    }
  }
  switch (rule.kind) {
    case "rpi":
    case "lower-of-rpi-and-bank-rate":
      return rpi;
    case "rpi-plus":
      return capped(rpi + rule.margin / 100, rule.cap);
  }
}

/** The first day of a tax month (1 is April) in the tax year starting in `startYear`. */
function monthStart(startYear: number, month: number): string {
  const calendarMonth = ((month + 2) % 12) + 1;
  const year = month <= 9 ? startYear : startYear + 1;
  return `${String(year)}-${String(calendarMonth).padStart(2, "0")}-06`;
}

/** The last day of a tax month: the 5th of the next calendar month. */
function monthEnd(startYear: number, month: number): string {
  return month === 12
    ? `${String(startYear + 1)}-04-05`
    : monthStart(startYear, month + 1).replace(/-06$/, "-05");
}

function taxMonthOf(date: string): number {
  const calendarMonth = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const month = ((calendarMonth - 4 + 12) % 12) + 1;
  return day >= 6 ? month : ((month + 10) % 12) + 1;
}

function assumptionsFor(
  inputs: TakeHomeInputs,
  registry: TaxYearRegistry,
  firstStartYear: number,
): string[] {
  const { salaryGrowthPercent, rpiPercent } = inputs.projection;
  const latest = registry.at(-1);
  const lastInterest = interestYears.at(-1);
  if (latest === undefined || lastInterest === undefined) {
    throw new Error("no rules to project from");
  }
  const assumptions = [
    `Salary and bonus grow by ${String(salaryGrowthPercent)}% a year after ${inputs.taxYear}; pension contributions set as a fixed amount stay the same.`,
    `RPI is ${String(rpiPercent)}% a year. It sets interest after August ${lastInterest.to.slice(0, 4)} and repayment thresholds after ${latest.id}.`,
    "Interest is added each month at a twelfth of the yearly rate, before that month's repayment.",
    "Repayments start with the pay month the projection starts in, or on 6 April of the year they're first due if that's later.",
  ];
  for (const loan of inputs.studentLoans) {
    const rules = studentLoanPlanRules[loan.plan];
    const notYetDue = !repaymentsDue(loan.firstRepaymentYear, firstStartYear);
    const notes = [
      ["repayment threshold", rules.thresholdUprating],
      ["interest", rules.interest],
      ...(notYetDue && rules.interestBeforeRepaymentsDue !== null
        ? [["interest before repayments are due", rules.interestBeforeRepaymentsDue] as const]
        : []),
      ["write-off", rules.writeOffYears],
    ] as const;
    for (const [topic, sourced] of notes) {
      if (sourced.note !== undefined) {
        assumptions.push(`${rules.name} ${topic}: ${sourced.note}`);
      }
    }
    const interest = rules.interest.value;
    if (interest.kind === "lower-of-rpi-and-bank-rate") {
      assumptions.push(`${rules.name} interest: RPI, assuming Bank Rate + 1% stays above it.`);
    }
    if (interest.kind === "income-linked") {
      assumptions.push(
        `${rules.name} interest: depends on NI-able pay in the same tax year, rising from RPI at the repayment threshold to the maximum at an upper threshold. ${plan2UpperInterestThreshold.uprating.note ?? ""}`.trim(),
      );
    }
  }
  if (inputs.pension.method === "salary-sacrifice") {
    const cap = salarySacrificeNiCap.value;
    assumptions.push(
      `From April ${String(cap.fromStartYear)} only the first £${(cap.annualCap / 100).toLocaleString("en-GB")} a year of salary sacrifice is expected to be free of NI, and student loan repayments are worked out on the same pay. ${salarySacrificeNiCap.note ?? ""}`.trim(),
    );
  }
  if (inputs.studentLoans.some((loan) => loan.balance === null)) {
    assumptions.push(
      "Loans without a balance are assumed to stay outstanding, so they keep their share of repayments.",
    );
  }
  return assumptions.filter((assumption) => assumption !== "");
}

interface LoanState {
  readonly plan: StudentLoanPlan;
  /** Null when unknown: the loan still takes its share of repayments but isn't tracked. */
  balance: Pence | null;
  /** The tax year repayments are first due in, or null if unknown (taken as already due). */
  readonly firstRepaymentYear: number | null;
  /** The plan's usual term, counted from the first repayment year, if that's known. */
  readonly termStartYear: number | null;
  /** When the projection writes it off: the term, unless the loan may be on older terms. */
  readonly writeOffStartYear: number | null;
  /** Older terms the loan is, or may be, on. */
  readonly older: {
    readonly firstPaid: Exclude<FirstPaid, "on-or-after-cutoff">;
    readonly terms: OlderLoanTerms;
  } | null;
  /** Still open: accruing interest, and having repayments taken once they're due. */
  repaying: boolean;
  end:
    | { kind: "already-repaid" }
    | { kind: "repaid"; date: string }
    | { kind: "written-off"; date: string; balance: Pence }
    | null;
  readonly points: LoanPoint[];
  readonly months: LoanMonth[];
  repaidSincePoint: number;
  interestSincePoint: number;
  totalRepaid: number;
  totalInterest: number;
}

/** The first day of the tax year starting in `startYear`, when write-offs and repayments start. */
function taxYearStartDate(startYear: number): string {
  return `${String(startYear)}-04-06`;
}

function addPoint(state: LoanState, date: string, startYear: number): void {
  if (state.balance === null) {
    throw new Error("can't chart a loan without a balance");
  }
  state.points.push({
    date,
    taxYear: taxYearId(startYear),
    balance: state.balance,
    repaid: asPence(state.repaidSincePoint),
    interest: asPence(state.interestSincePoint),
  });
  state.repaidSincePoint = 0;
  state.interestSincePoint = 0;
}

function outcomeOf(state: LoanState, horizonEnd: string): LoanOutcome {
  if (state.balance === null) {
    return { kind: "unknown", missing: "balance" };
  }
  const { end, older } = state;
  if (end?.kind === "already-repaid") {
    return end;
  }
  if (older !== null) {
    const repaidBy = end?.kind === "repaid" ? end.date : null;
    const termDate = state.termStartYear === null ? null : taxYearStartDate(state.termStartYear);
    return {
      kind: "may-be-written-off-at-age",
      firstPaid: older.firstPaid,
      terms: older.terms,
      firstRepaymentYearKnown: state.firstRepaymentYear !== null,
      repaidBy,
      termWriteOff:
        end?.kind === "written-off"
          ? { appliesTo: "every-loan", date: end.date }
          : termDate !== null &&
              older.firstPaid === "not-sure" &&
              (repaidBy === null || termDate < repaidBy)
            ? { appliesTo: "newer-loans", date: termDate }
            : null,
    };
  }
  if (state.writeOffStartYear === null) {
    return {
      kind: "unknown",
      missing: "first-repayment-year",
      repaidBy: end?.kind === "repaid" ? end.date : null,
    };
  }
  if (end === null) {
    return { kind: "outstanding", horizonEnd, balance: state.balance };
  }
  return end.kind === "repaid"
    ? { kind: "repaid", date: end.date }
    : { kind: "written-off", date: end.date, balanceWrittenOff: end.balance };
}

/**
 * Projects each student loan month by month from `start`: pay grows at the assumed rate,
 * repayments follow each year's rules (uprated beyond the known years), interest follows each
 * plan's rule, and loans are written off when their term ends.
 */
export function projectStudentLoans(
  inputs: TakeHomeInputs,
  registry: TaxYearRegistry,
  start: Date,
): StudentLoanProjection {
  const today = ukDate(start);
  const firstStartYear = taxYearStartYearOf(today);
  if (findTaxYearRules(registry, taxYearId(firstStartYear)) === undefined) {
    return { status: "no-rules", taxYear: taxYearId(firstStartYear) };
  }
  const firstInterest = interestYears[0];
  if (firstInterest === undefined || today < firstInterest.from) {
    throw new Error(`no student loan interest rates for ${today}`);
  }
  const { salaryGrowthPercent, rpiPercent } = inputs.projection;
  const inputStartYear = startYearOfTaxYear(inputs.taxYear);
  const yearFor = projectionYears(registry, rpiPercent);
  const lastStartYear = firstStartYear + horizonYears - 1;
  const horizonEnd = `${String(lastStartYear + 1)}-04-05`;

  const states = inputs.studentLoans.map((loan): LoanState => {
    const termStartYear =
      loan.firstRepaymentYear === null
        ? null
        : loan.firstRepaymentYear + studentLoanPlanRules[loan.plan].writeOffYears.value;
    const older =
      hasOlderTerms(loan) && loan.firstPaid !== "on-or-after-cutoff"
        ? { firstPaid: loan.firstPaid, terms: olderLoanTerms[loan.plan].value }
        : null;
    // Older terms that write off at an age alone have no term the projection can apply.
    const writeOffStartYear = older?.terms.writeOff.kind === "at-age" ? null : termStartYear;
    const state: LoanState = {
      plan: loan.plan,
      balance: loan.balance,
      firstRepaymentYear: loan.firstRepaymentYear,
      termStartYear,
      writeOffStartYear,
      older,
      repaying: true,
      end: null,
      points: [],
      months: [],
      repaidSincePoint: 0,
      interestSincePoint: 0,
      totalRepaid: 0,
      totalInterest: 0,
    };
    if (state.balance === 0) {
      state.repaying = false;
      state.end = { kind: "already-repaid" };
      return state;
    }
    if (state.balance !== null) {
      addPoint(state, today, firstStartYear);
    }
    if (writeOffStartYear !== null && taxYearStartDate(writeOffStartYear) <= today) {
      state.repaying = false;
      if (state.balance !== null) {
        state.end = {
          kind: "written-off",
          date: taxYearStartDate(writeOffStartYear),
          balance: state.balance,
        };
      }
    }
    return state;
  });
  const tracking = () => states.some((state) => state.repaying && state.balance !== null);

  for (let startYear = firstStartYear; startYear <= lastStartYear && tracking(); startYear++) {
    for (const state of states) {
      if (state.repaying && state.writeOffStartYear === startYear) {
        state.repaying = false;
        if (state.balance !== null) {
          state.end = {
            kind: "written-off",
            date: taxYearStartDate(startYear),
            balance: state.balance,
          };
          addPoint(state, taxYearStartDate(startYear), startYear);
        }
      }
    }
    if (!tracking()) {
      break;
    }

    const year = yearFor(startYear);
    const growth = Math.pow(1 + salaryGrowthPercent / 100, startYear - inputStartYear);
    const pay = payYear(
      {
        salary: asPence(Math.round(inputs.salary * growth)),
        bonus: { ...inputs.bonus, amount: asPence(Math.round(inputs.bonus.amount * growth)) },
        pension: inputs.pension,
      },
      {
        reliefAtSourceRate: year.reliefAtSourceRate,
        salarySacrificeNiRelief: year.salarySacrificeNiRelief,
      },
    );
    if (!pay.ok) {
      return { status: "invalid", taxYear: taxYearId(startYear), issues: pay.issues };
    }
    const plan2 = {
      income: sum(pay.months.map((month: MonthPay) => month.niablePay)),
      lower: year.studentLoans.plan2.threshold.value.annual,
      upper: year.plan2UpperInterestThreshold,
    };

    const firstMonth = startYear === firstStartYear ? taxMonthOf(today) : 1;
    for (let month = firstMonth; month <= 12; month++) {
      const repaying = states.filter((state) => state.repaying);
      const collecting = repaying.filter((state) =>
        repaymentsDue(state.firstRepaymentYear, startYear),
      );
      const repayments = studentLoanRepayments(
        itemAt(pay.months, month - 1).niablePay,
        collecting.map((state) => state.plan),
        year.studentLoans,
      );
      for (const state of repaying) {
        if (state.balance === null) {
          continue;
        }
        const rate = interestRate(
          state.plan,
          monthStart(startYear, month),
          rpiPercent,
          repaymentsDue(state.firstRepaymentYear, startYear)
            ? { kind: "repayments-due", plan2 }
            : { kind: "before-repayments-due" },
        );
        const interest = Math.round((state.balance * rate) / 1_200);
        const due = state.balance + interest;
        const deduction = collecting.includes(state)
          ? repayments.find((repayment) => repayment.plan === state.plan)?.amount
          : asPence(0);
        if (deduction === undefined) {
          throw new Error(`no repayment worked out for ${state.plan}`);
        }
        const repaid = Math.min(deduction, due);
        state.balance = asPence(due - repaid);
        state.interestSincePoint += interest;
        state.repaidSincePoint += repaid;
        state.totalInterest += interest;
        state.totalRepaid += repaid;
        state.months.push({
          date: monthEnd(startYear, month),
          taxYear: taxYearId(startYear),
          pay: itemAt(pay.months, month - 1).niablePay,
          interestRatePercent: rate,
          interest: asPence(interest),
          repaid: asPence(repaid),
          balance: state.balance,
        });
        if (state.balance === 0) {
          state.repaying = false;
          state.end = { kind: "repaid", date: monthEnd(startYear, month) };
          addPoint(state, monthEnd(startYear, month), startYear);
        }
      }
    }
    for (const state of states) {
      if (state.repaying && state.balance !== null) {
        addPoint(state, monthEnd(startYear, 12), startYear);
      }
    }
  }

  const loans = states.map((state): LoanProjection => ({
    plan: state.plan,
    name: studentLoanPlanRules[state.plan].name,
    outcome: outcomeOf(state, horizonEnd),
    repaymentsStart:
      state.firstRepaymentYear !== null && state.firstRepaymentYear > firstStartYear
        ? taxYearStartDate(state.firstRepaymentYear)
        : null,
    points: state.points,
    months: state.months,
    totalRepaid: asPence(state.totalRepaid),
    totalInterest: asPence(state.totalInterest),
  }));
  return {
    status: "ok",
    start: today,
    loans,
    totalRepaid: sum(loans.map((loan) => loan.totalRepaid)),
    totalInterest: sum(loans.map((loan) => loan.totalInterest)),
    assumptions: assumptionsFor(inputs, registry, firstStartYear),
  };
}
