import { asPence, type Pence } from "../money.ts";
import {
  itemAt,
  minus,
  percentOf,
  rateOfNearest,
  splitAcrossMonths,
  sum,
  wholeRate,
} from "./arithmetic.ts";
import type { Contribution, TakeHomeInputs } from "./inputs.ts";
import type { InputIssue } from "./result.ts";
import type { Rate, SalarySacrificeNiRelief } from "./rules/types.ts";

/** One month's pay and pension contributions, before tax, NI and student loans. */
export interface MonthPay {
  /** 1 is April. */
  readonly month: number;
  readonly salary: Pence;
  readonly bonus: Pence;
  readonly grossPay: Pence;
  /** The gross amount the employee puts in, however it's paid. */
  readonly employeeContribution: Pence;
  readonly salarySacrifice: Pence;
  readonly netPayContribution: Pence;
  /** Relief at source: what comes out of net pay, and what the provider adds. */
  readonly reliefAtSourcePaid: Pence;
  readonly reliefAtSourceTopUp: Pence;
  readonly employerContribution: Pence;
  readonly taxablePay: Pence;
  readonly niablePay: Pence;
}

export type PayInputs = Pick<TakeHomeInputs, "salary" | "bonus" | "pension">;

export interface PayRules {
  readonly reliefAtSourceRate: Rate;
  readonly salarySacrificeNiRelief: SalarySacrificeNiRelief;
}

function contributionByMonth(contribution: Contribution, payByMonth: readonly Pence[]): Pence[] {
  switch (contribution.kind) {
    case "percent":
      return payByMonth.map((pay) => percentOf(pay, contribution.percent));
    case "annual":
      return splitAcrossMonths(contribution.amount);
  }
}

function bonusContribution(contribution: Contribution, bonus: Pence): Pence {
  switch (contribution.kind) {
    case "percent":
      return percentOf(bonus, contribution.percent);
    case "annual":
      return contribution.amount;
  }
}

/**
 * The share of salary-sacrificed pay that's still NI-able, as a numerator and denominator. Where
 * relief is capped, each month's sacrifice is NI-free in proportion to the cap.
 */
export function niableShareOfSacrifice(
  relief: SalarySacrificeNiRelief,
  annualSacrifice: Pence,
): { numerator: number; denominator: number } {
  switch (relief.kind) {
    case "unlimited":
      return { numerator: 0, denominator: 1 };
    case "capped":
      return annualSacrifice <= relief.annualCap
        ? { numerator: 0, denominator: 1 }
        : { numerator: annualSacrifice - relief.annualCap, denominator: annualSacrifice };
  }
}

export type PayYear =
  | {
      readonly ok: true;
      readonly months: readonly MonthPay[];
      /** The fraction of salary-sacrificed pay that's still NI-able. */
      readonly niableFractionOfSacrifice: number;
    }
  | { readonly ok: false; readonly issues: readonly InputIssue[] };

/**
 * What a relief at source contribution of `gross` costs from net pay: the provider adds the rest
 * as basic-rate relief.
 */
export function reliefAtSourcePaidFromPay(gross: Pence, reliefAtSourceRate: Rate): Pence {
  return rateOfNearest(gross, (wholeRate - reliefAtSourceRate) as Rate);
}

/** Splits a year's pay and pension contributions into months, as payroll would. */
export function payYear(inputs: PayInputs, rules: PayRules): PayYear {
  const { pension } = inputs;
  const salaries = splitAcrossMonths(inputs.salary);
  const bonuses = salaries.map((_, index) =>
    index + 1 === inputs.bonus.month ? inputs.bonus.amount : asPence(0),
  );
  const fromSalary = contributionByMonth(pension.fromSalary, salaries);
  const fromBonus = bonuses.map((bonus) =>
    bonus > 0 ? bonusContribution(pension.fromBonus, bonus) : asPence(0),
  );
  const employer = contributionByMonth(pension.employer, salaries);

  const issues: InputIssue[] = [];
  if (fromSalary.some((amount, index) => amount > itemAt(salaries, index))) {
    issues.push({
      kind: "pension-exceeds-pay",
      from: "salary",
      message: "The pension contribution from salary is more than the salary.",
    });
  }
  if (fromBonus.some((amount, index) => amount > itemAt(bonuses, index))) {
    issues.push({
      kind: "pension-exceeds-pay",
      from: "bonus",
      message: "The pension contribution from the bonus is more than the bonus.",
    });
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const employeeByMonth = fromSalary.map((amount, index) =>
    sum([amount, itemAt(fromBonus, index)]),
  );
  const sacrificing = pension.method === "salary-sacrifice";
  const niableShare = niableShareOfSacrifice(
    rules.salarySacrificeNiRelief,
    sacrificing ? sum(employeeByMonth) : asPence(0),
  );

  const months = salaries.map((salary, index): MonthPay => {
    const bonus = itemAt(bonuses, index);
    const grossPay = sum([salary, bonus]);
    const employeeContribution = itemAt(employeeByMonth, index);
    const salarySacrifice = sacrificing ? employeeContribution : asPence(0);
    const netPayContribution = pension.method === "net-pay" ? employeeContribution : asPence(0);
    const reliefAtSourcePaid =
      pension.method === "relief-at-source"
        ? reliefAtSourcePaidFromPay(employeeContribution, rules.reliefAtSourceRate)
        : asPence(0);
    const reliefAtSourceTopUp =
      pension.method === "relief-at-source"
        ? minus(employeeContribution, reliefAtSourcePaid)
        : asPence(0);
    const niableSacrifice = asPence(
      Math.round((salarySacrifice * niableShare.numerator) / niableShare.denominator),
    );
    return {
      month: index + 1,
      salary,
      bonus,
      grossPay,
      employeeContribution,
      salarySacrifice,
      netPayContribution,
      reliefAtSourcePaid,
      reliefAtSourceTopUp,
      employerContribution: itemAt(employer, index),
      taxablePay: minus(minus(grossPay, salarySacrifice), netPayContribution),
      niablePay: sum([minus(grossPay, salarySacrifice), niableSacrifice]),
    };
  });
  return {
    ok: true,
    months,
    niableFractionOfSacrifice: niableShare.numerator / niableShare.denominator,
  };
}
