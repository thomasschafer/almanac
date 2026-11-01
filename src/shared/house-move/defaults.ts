import { fromPounds as pounds } from "../money.ts";
import { percent, signedPercent } from "../rates.ts";
import type { Month } from "./months.ts";
import { houseMoveInputs, type HouseMoveInputs } from "./inputs.ts";

/** Starting figures when the optional borrowing check is enabled. */
export function defaultBorrowingCheck(): NonNullable<HouseMoveInputs["borrowingCheck"]> {
  return { annualIncome: pounds(50_000), incomeGrowth: signedPercent(3), multiple: 4.5 };
}

export function defaultHouseMoveInputs(today: Month): HouseMoveInputs {
  const fixed = (id: string, name: string, amount: number, timing: "completion" | "upfront") => ({
    id,
    name,
    amount: { kind: "fixed" as const, amount: pounds(amount) },
    plusVat: false,
    timing,
  });
  return houseMoveInputs.parse({
    asOf: today,
    homeValue: pounds(300_000),
    targetPrice: pounds(450_000),
    mortgage: {
      balance: pounds(150_000),
      rate: percent(4.5),
      remainingMonths: 240,
      paymentOverride: null,
      fixedRate: null,
      monthlyOverpayment: pounds(0),
      oneOffOverpayments: [],
      overpaymentMode: "shorten-term",
      annualOverpaymentAllowance: percent(10),
      ercBands: [],
      exitFee: pounds(0),
    },
    deposit: { kind: "percent", rate: percent(25) },
    growth: { home: signedPercent(3), target: signedPercent(3), inflation: signedPercent(2.5) },
    region: "england-ni",
    cash: { savings: pounds(0), monthlySaving: pounds(0), interestRate: percent(0) },
    borrowingCheck: null,
    costs: [
      {
        id: "estate-agent",
        name: "Estate agent",
        amount: { kind: "sale-percent", rate: percent(1.25) },
        plusVat: true,
        timing: "completion",
      },
      fixed("sale-legal", "Conveyancing (sale)", 1500, "completion"),
      fixed("purchase-legal", "Conveyancing (purchase)", 2000, "completion"),
      fixed("arrangement", "Mortgage arrangement fee", 999, "completion"),
      fixed("epc", "Energy performance cert.", 90, "upfront"),
      fixed("searches", "Searches", 400, "upfront"),
      fixed("survey", "Survey", 700, "upfront"),
      fixed("broker", "Mortgage broker", 500, "upfront"),
      fixed("removals", "Removals", 1500, "upfront"),
    ],
  });
}
