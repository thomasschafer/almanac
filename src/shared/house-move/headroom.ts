import { growthFactor } from "./arithmetic.ts";
import type { HouseMoveInputs } from "./inputs.ts";
import { lbtt, sdlt, vat } from "./rules/index.ts";

/**
 * Conservative upper bounds for every nominal and real-money intermediate in the projection.
 * Mortgage debt cannot grow while payments cover interest. Savings include a penny per month
 * for rounding and assume every contribution earns interest for the entire horizon. The margin
 * covers floating-point growth-factor error and rounding of the other monetary values.
 */
export function hasProjectionHeadroom(input: HouseMoveInputs, months: number): boolean {
  const maximumGrowth = (rate: Parameters<typeof growthFactor>[0]) =>
    Math.max(1, growthFactor(rate, months));
  const home = input.homeValue * maximumGrowth(input.growth.home);
  const target = input.targetPrice * maximumGrowth(input.growth.target);
  const inflation = maximumGrowth(input.growth.inflation);
  const savings =
    (input.cash.savings + months * (input.cash.monthlySaving + 1)) *
    growthFactor(input.cash.interestRate, 1) ** months;
  let costs = 0;
  for (const cost of input.costs) {
    let net: number;
    switch (cost.amount.kind) {
      case "fixed":
        net = cost.amount.amount * inflation;
        break;
      case "sale-percent":
        net = (home * cost.amount.rate) / 10_000;
        break;
      case "purchase-percent":
        net = (target * cost.amount.rate) / 10_000;
        break;
    }
    costs += (net + 1) * (1 + (cost.plusVat ? vat.rate.value / 10_000 : 0)) + 1;
  }
  // Include the deposit and an upper bound on buying tax, plus mortgage debt and ERC.
  const taxRate =
    Math.max(
      ...sdlt.bands.value.map((band) => band.rate),
      ...lbtt.bands.value.map((band) => band.rate),
    ) / 10_000;
  const nominal =
    home +
    target * (1 + taxRate) +
    2 * input.mortgage.balance +
    input.mortgage.exitFee +
    costs +
    savings +
    1;
  const real = nominal * Math.max(1, 1 / growthFactor(input.growth.inflation, months));
  const deposit = input.deposit.kind === "amount" ? input.deposit.amount * inflation : target;
  const borrowing =
    input.borrowingCheck === null
      ? 0
      : input.borrowingCheck.annualIncome *
        maximumGrowth(input.borrowingCheck.incomeGrowth) *
        input.borrowingCheck.multiple;
  const maximum = Math.max(nominal, real, deposit, borrowing);
  return Number.isFinite(maximum) && maximum * 1.000001 + 1_000_000 < Number.MAX_SAFE_INTEGER;
}
