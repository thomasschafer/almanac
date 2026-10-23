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

export const studentLoan = z.strictObject({
  plan: studentLoanPlan,
  /** The outstanding balance, for the payoff projection. Null if unknown. */
  balance: nonNegativePence.nullable(),
  /**
   * The calendar year of the April the borrower was first due to repay, from which write-off is
   * counted. Null if unknown, in which case the projection can't say when it's written off.
   */
  firstRepaymentYear: z.number().int().min(1990).max(2100).nullable(),
});
export type StudentLoan = z.infer<typeof studentLoan>;

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
  studentLoans: z
    .array(studentLoan)
    .refine((loans) => new Set(loans.map((l) => l.plan)).size === loans.length, {
      message: "each student loan plan can only appear once",
    }),
  /** Overrides the tax code worked out from the allowance, such as "1257L", "BR" or "K500". */
  taxCode: z.string().trim().toUpperCase().min(1).nullable(),
  /** Assumptions for the student loan projection. */
  projection: z.strictObject({
    salaryGrowthPercent: z.number().min(-20).max(50),
    rpiPercent: z.number().min(-10).max(30),
  }),
});
export type TakeHomeInputs = z.infer<typeof takeHomeInputs>;
