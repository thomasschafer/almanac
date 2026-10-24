import { asPence } from "../../src/shared/money.ts";
import type { TakeHomeInputs } from "../../src/shared/take-home/inputs.ts";

/** Made-up figures that exercise most of the take-home page. Never use real ones. */
export const exampleInputs: TakeHomeInputs = {
  taxYear: "2026-27",
  region: "rest-of-uk",
  salary: asPence(9_500_000),
  bonus: { amount: asPence(1_500_000), month: 12 },
  pension: {
    method: "salary-sacrifice",
    fromSalary: { kind: "percent", percent: 6 },
    fromBonus: { kind: "percent", percent: 50 },
    employer: { kind: "percent", percent: 5 },
    employerNiPassOnPercent: 0,
  },
  studentLoans: [{ plan: "plan2", balance: asPence(4_200_000), firstRepaymentYear: 2018 }],
  taxCode: null,
  projection: { salaryGrowthPercent: 3, rpiPercent: 3 },
};
