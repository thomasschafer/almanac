import { z } from "zod";
import { nonNegativePence } from "../money.ts";

export const studentLoanPlans = ["plan1", "plan2", "plan4", "plan5", "postgraduate"] as const;
export const studentLoanPlan = z.enum(studentLoanPlans);
export type StudentLoanPlan = z.infer<typeof studentLoanPlan>;

export const pensionMethods = ["salary-sacrifice", "net-pay", "relief-at-source"] as const;
export type PensionMethod = (typeof pensionMethods)[number];

/** A contribution as a percentage of the pay it comes from, or a fixed amount a year. */
export const contribution = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("percent"), percent: z.number().min(0).max(100) }),
  z.strictObject({ kind: z.literal("annual"), amount: nonNegativePence }),
]);
export type Contribution = z.infer<typeof contribution>;

/**
 * Plans whose older loans, first paid before a cutoff date in the rules, are written off on
 * different terms.
 */
export const plansWithOlderLoans = ["plan1", "plan4"] as const satisfies readonly StudentLoanPlan[];
export type PlanWithOlderLoans = (typeof plansWithOlderLoans)[number];
const plansWithoutOlderLoans = [
  "plan2",
  "plan5",
  "postgraduate",
] as const satisfies readonly Exclude<StudentLoanPlan, PlanWithOlderLoans>[];
if (plansWithOlderLoans.length + plansWithoutOlderLoans.length !== studentLoanPlans.length) {
  throw new Error("every student loan plan must be with or without older loans");
}

/** When a Plan 1 or Plan 4 loan was first paid, relative to the plan's cutoff date. */
export const firstPaidOptions = ["before-cutoff", "on-or-after-cutoff", "not-sure"] as const;
export type FirstPaid = (typeof firstPaidOptions)[number];

const loanFields = {
  /** The outstanding balance, for the payoff projection. Null if unknown. */
  balance: nonNegativePence.nullable(),
  /**
   * The calendar year of the April the borrower was first due to repay, from which write-off is
   * counted. Null if unknown, in which case the projection can't say when it's written off.
   */
  firstRepaymentYear: z.number().int().min(1990).max(2100).nullable(),
};

export const studentLoan = z.discriminatedUnion("plan", [
  z.strictObject({
    plan: z.enum(plansWithOlderLoans),
    ...loanFields,
    firstPaid: z.enum(firstPaidOptions),
  }),
  z.strictObject({ plan: z.enum(plansWithoutOlderLoans), ...loanFields }),
]);
export type StudentLoan = z.infer<typeof studentLoan>;
export type LoanWithOlderTerms = Extract<StudentLoan, { plan: PlanWithOlderLoans }>;

export function hasOlderTerms(loan: StudentLoan): loan is LoanWithOlderTerms {
  return "firstPaid" in loan;
}

/** A newly added loan, with nothing known about it yet. */
export function newStudentLoan(plan: StudentLoanPlan): StudentLoan {
  const fields = { balance: null, firstRepaymentYear: null };
  switch (plan) {
    case "plan1":
    case "plan4":
      return { plan, ...fields, firstPaid: "not-sure" };
    case "plan2":
    case "plan5":
    case "postgraduate":
      return { plan, ...fields };
  }
}

/**
 * A loan as it may have been stored, read as the current shape. Plan 1 and Plan 4 loans saved
 * before `firstPaid` existed are read as "not sure".
 */
const storedStudentLoan = z.union([
  studentLoan,
  z
    .strictObject({ plan: z.enum(plansWithOlderLoans), ...loanFields })
    .transform((loan): StudentLoan => ({ ...loan, firstPaid: "not-sure" })),
]);

function studentLoanList<T extends z.ZodType<{ readonly plan: StudentLoanPlan }>>(loan: T) {
  return z.array(loan).refine((loans) => new Set(loans.map((l) => l.plan)).size === loans.length, {
    message: "each student loan plan can only appear once",
  });
}

export const takeHomeInputs = z.strictObject({
  /** A tax year id from the rules registry, such as "2026-27". */
  taxYear: z.string().regex(/^\d{4}-\d{2}$/),
  region: z.enum(["rest-of-uk", "scotland"]),
  salary: nonNegativePence,
  bonus: z.strictObject({
    amount: nonNegativePence,
    /** The month of the tax year it's paid in: 1 is April, 12 is March. */
    month: z.number().int().min(1).max(12),
  }),
  /**
   * Employee contributions are the gross amount going into the pension, whatever the method: with
   * relief at source, the basic-rate share of it is added by the provider rather than taken from
   * pay.
   */
  pension: z.strictObject({
    method: z.enum(pensionMethods),
    /** Taken from base salary, evenly across the year. */
    fromSalary: contribution,
    /** Taken from the bonus, in the month it's paid. A fixed amount is taken from the bonus whole. */
    fromBonus: contribution,
    /** Paid by the employer, as a share of base salary. */
    employer: contribution,
    /**
     * The share of the employer's NI saving they add to the pension, for salary sacrifice only.
     */
    employerNiPassOnPercent: z.number().min(0).max(100),
  }),
  studentLoans: studentLoanList(studentLoan),
  /** Overrides the tax code worked out from the allowance, such as "1257L", "BR" or "K500". */
  taxCode: z.string().trim().toUpperCase().min(1).nullable(),
  /** Assumptions for the student loan projection. */
  projection: z.strictObject({
    salaryGrowthPercent: z.number().min(-20).max(50),
    rpiPercent: z.number().min(-10).max(30),
  }),
});
export type TakeHomeInputs = z.infer<typeof takeHomeInputs>;

/**
 * Inputs as they may have been stored or cached, read as the current shape. Only reading accepts
 * older shapes; writing needs the current one.
 */
export const storedTakeHomeInputs = takeHomeInputs.extend({
  studentLoans: studentLoanList(storedStudentLoan),
});
