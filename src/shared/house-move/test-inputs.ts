import { fromPounds as pounds } from "../money.ts";
import { percent, signedPercent } from "../rates.ts";
import { defaultHouseMoveInputs } from "./defaults.ts";
import type { HouseMoveInputs } from "./inputs.ts";

export const today = "2026-11";

/** Small, flat-price examples with no incidental costs unless a test supplies them. */
export function testInputs(): HouseMoveInputs {
  const input = defaultHouseMoveInputs(today);
  return {
    ...input,
    homeValue: pounds(1000),
    targetPrice: pounds(10_000),
    deposit: { kind: "percent", rate: percent(10) },
    costs: [],
    growth: { home: signedPercent(0), target: signedPercent(0), inflation: signedPercent(0) },
    mortgage: { ...input.mortgage, balance: pounds(1200), rate: percent(0), remainingMonths: 12 },
  };
}

/** Every monetary input is at its upper bound, including optional mortgage and cost inputs. */
export function maximumInputs(): HouseMoveInputs {
  const maximum = pounds(100_000_000);
  const input = testInputs();
  return {
    ...input,
    homeValue: maximum,
    targetPrice: maximum,
    deposit: { kind: "amount", amount: maximum },
    mortgage: {
      ...input.mortgage,
      balance: maximum,
      rate: percent(20),
      remainingMonths: 600,
      paymentOverride: maximum,
      monthlyOverpayment: maximum,
      exitFee: maximum,
      fixedRate: { until: "2066-11", followOnRate: percent(20) },
      oneOffOverpayments: [{ month: "2026-12", amount: maximum }],
      annualOverpaymentAllowance: percent(100),
      ercBands: [{ until: "2066-11", rate: percent(100) }],
    },
    growth: { home: signedPercent(20), target: signedPercent(20), inflation: signedPercent(20) },
    cash: { savings: maximum, monthlySaving: maximum, interestRate: percent(20) },
    borrowingCheck: { annualIncome: maximum, incomeGrowth: signedPercent(20), multiple: 10 },
    costs: [
      {
        id: "fixed",
        name: "Fixed",
        amount: { kind: "fixed", amount: maximum },
        timing: "completion",
        plusVat: true,
      },
      {
        id: "sale",
        name: "Sale",
        amount: { kind: "sale-percent", rate: percent(100) },
        timing: "completion",
        plusVat: true,
      },
      {
        id: "purchase",
        name: "Purchase",
        amount: { kind: "purchase-percent", rate: percent(100) },
        timing: "upfront",
        plusVat: true,
      },
    ],
  };
}
