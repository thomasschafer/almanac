import { asPence, type Pence } from "../money.ts";
import { floorToPound, positivePart, rateOfDown } from "./arithmetic.ts";
import type { StudentLoanPlan } from "./inputs.ts";
import type { StudentLoanDeduction } from "./result.ts";
import type { Rate, StudentLoanYearRules } from "./rules/types.ts";

/**
 * Student loan repayments on one month's pay. They're worked out on the month's NI-able pay
 * alone and rounded down to the pound. With more than one undergraduate plan there's a single
 * repayment above the lowest threshold, split so the lowest-threshold plan gets no more than the
 * rate on the gap to the next threshold; a Postgraduate Loan is repaid alongside on its own
 * threshold: https://www.gov.uk/repaying-your-student-loan/what-you-pay
 */

export type StudentLoanRules = Readonly<Record<StudentLoanPlan, StudentLoanYearRules>>;

interface PlanThreshold {
  readonly plan: StudentLoanPlan;
  readonly threshold: Pence;
  readonly rate: Rate;
}

function undergraduatePlans(
  plans: readonly StudentLoanPlan[],
  rules: StudentLoanRules,
): PlanThreshold[] {
  const undergraduate = plans
    .filter((plan) => plan !== "postgraduate")
    .map((plan) => ({
      plan,
      threshold: rules[plan].threshold.value.monthly,
      rate: rules[plan].rate.value,
    }))
    .sort((a, b) => a.threshold - b.threshold);
  if (new Set(undergraduate.map((plan) => plan.rate)).size > 1) {
    throw new Error("undergraduate plans with different rates can't share one repayment");
  }
  return undergraduate;
}

export function studentLoanRepayments(
  niablePay: Pence,
  plans: readonly StudentLoanPlan[],
  rules: StudentLoanRules,
): StudentLoanDeduction[] {
  if (new Set(plans).size !== plans.length) {
    throw new Error("each student loan plan can only appear once");
  }
  const amounts = new Map<StudentLoanPlan, Pence>();

  const undergraduate = undergraduatePlans(plans, rules);
  const [lowest] = undergraduate;
  if (lowest !== undefined) {
    let remaining: number = floorToPound(
      rateOfDown(positivePart(asPence(niablePay - lowest.threshold)), lowest.rate),
    );
    undergraduate.forEach((plan, index) => {
      const next = undergraduate[index + 1];
      const share =
        next === undefined
          ? remaining
          : Math.min(
              remaining,
              floorToPound(rateOfDown(asPence(next.threshold - plan.threshold), plan.rate)),
            );
      amounts.set(plan.plan, asPence(share));
      remaining -= share;
    });
  }

  if (plans.includes("postgraduate")) {
    const { threshold, rate } = rules.postgraduate;
    amounts.set(
      "postgraduate",
      floorToPound(
        rateOfDown(positivePart(asPence(niablePay - threshold.value.monthly)), rate.value),
      ),
    );
  }

  return plans.map((plan) => {
    const amount = amounts.get(plan);
    if (amount === undefined) {
      throw new Error(`no repayment worked out for ${plan}`);
    }
    return { plan, amount };
  });
}

/** The share of the next pound of a month's NI-able pay that goes to each plan. */
export function marginalStudentLoanRates(
  niablePay: Pence,
  plans: readonly StudentLoanPlan[],
  rules: StudentLoanRules,
): { plan: StudentLoanPlan; rate: Rate }[] {
  const undergraduate = undergraduatePlans(plans, rules);
  const receiving = undergraduate.filter((plan) => niablePay >= plan.threshold).at(-1);
  return plans.map((plan) => {
    if (plan === "postgraduate") {
      const { threshold, rate } = rules.postgraduate;
      return { plan, rate: niablePay >= threshold.value.monthly ? rate.value : (0 as Rate) };
    }
    return { plan, rate: receiving?.plan === plan ? receiving.rate : (0 as Rate) };
  });
}
