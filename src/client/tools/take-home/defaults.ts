import { asPence } from "../../../shared/money.ts";
import type { TakeHomeInputs } from "../../../shared/take-home/inputs.ts";
import { taxYearId } from "../../../shared/take-home/rules/registry.ts";
import { taxYearStartYearOf, ukDate } from "../../../shared/take-home/rules/review.ts";

export function currentTaxYear(now: Date): string {
  return taxYearId(taxYearStartYearOf(ukDate(now)));
}

/** What a first visit shows: a plausible, made-up starting point to edit. */
export function defaultInputs(now: Date): TakeHomeInputs {
  return {
    taxYear: currentTaxYear(now),
    region: "rest-of-uk",
    salary: asPence(4_000_000),
    bonus: { amount: asPence(0), month: 12 },
    pension: {
      method: "salary-sacrifice",
      fromSalary: { kind: "percent", percent: 5 },
      fromBonus: { kind: "percent", percent: 0 },
      employer: { kind: "percent", percent: 3 },
      employerNiPassOnPercent: 0,
    },
    studentLoans: [],
    taxCode: null,
    projection: { salaryGrowthPercent: 3, rpiPercent: 3 },
  };
}
