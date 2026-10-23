import { fromPounds } from "../money.ts";
import { takeHomeInputs, type StudentLoanPlan, type TakeHomeInputs } from "./inputs.ts";

/** Made-up round figures for tests, validated by the real schema. */
export interface TestInputs {
  taxYear?: string;
  region?: TakeHomeInputs["region"];
  salary?: number;
  bonus?: number;
  bonusMonth?: number;
  method?: TakeHomeInputs["pension"]["method"];
  fromSalary?: { percent: number } | { annual: number };
  fromBonus?: { percent: number } | { annual: number };
  employer?: { percent: number } | { annual: number };
  niPassOnPercent?: number;
  loans?: readonly (
    | StudentLoanPlan
    | { plan: StudentLoanPlan; balance: number | null; firstRepaymentYear: number | null }
  )[];
  taxCode?: string | null;
  salaryGrowthPercent?: number;
  rpiPercent?: number;
}

function contribution(value: { percent: number } | { annual: number } | undefined) {
  if (value === undefined) {
    return { kind: "percent", percent: 0 };
  }
  return "percent" in value
    ? { kind: "percent", percent: value.percent }
    : { kind: "annual", amount: fromPounds(value.annual) };
}

/** Builds inputs from pounds, defaulting to no bonus, pension or loans. */
export function testInputs(overrides: TestInputs = {}): TakeHomeInputs {
  return takeHomeInputs.parse({
    taxYear: overrides.taxYear ?? "2026-27",
    region: overrides.region ?? "rest-of-uk",
    salary: fromPounds(overrides.salary ?? 30_000),
    bonus: { amount: fromPounds(overrides.bonus ?? 0), month: overrides.bonusMonth ?? 12 },
    pension: {
      method: overrides.method ?? "salary-sacrifice",
      fromSalary: contribution(overrides.fromSalary),
      fromBonus: contribution(overrides.fromBonus),
      employer: contribution(overrides.employer),
      employerNiPassOnPercent: overrides.niPassOnPercent ?? 0,
    },
    studentLoans: (overrides.loans ?? []).map((loan) =>
      typeof loan === "string"
        ? { plan: loan, balance: null, firstRepaymentYear: null }
        : {
            plan: loan.plan,
            balance: loan.balance === null ? null : fromPounds(loan.balance),
            firstRepaymentYear: loan.firstRepaymentYear,
          },
    ),
    taxCode: overrides.taxCode ?? null,
    projection: {
      salaryGrowthPercent: overrides.salaryGrowthPercent ?? 0,
      rpiPercent: overrides.rpiPercent ?? 3,
    },
  });
}
