import { asPence, type Pence } from "../money.ts";
import { atRate, grow, growthFactor, roundedRatio } from "./arithmetic.ts";
import { houseMoveInputs, type HouseMoveInputs } from "./inputs.ts";
import { addMonths, monthIndex, type Month } from "./months.ts";
import { houseMoveInputProblems } from "./problems.ts";
import { mortgageProjection } from "./mortgage.ts";
import type { HouseMoveCalculation, MonthBreakdown, MoveDate } from "./result.ts";
import { buyingTax, lbtt, sdlt, vat } from "./rules/index.ts";

/**
 * Projects from the as-of month through 480 months after today; only months from today can
 * qualify. Savings are a hypothetical cash balance at each sale date, so up-front costs are
 * deducted once at that date. A cash shortfall never consumes equity or delays affordability.
 */
export function calculateHouseMove(raw: HouseMoveInputs, today: Month): HouseMoveCalculation {
  const input = houseMoveInputs.parse(raw);
  const problems = houseMoveInputProblems(input, today);
  if (problems.length > 0) throw new Error(problems.map((problem) => problem.message).join("; "));
  const elapsed = monthIndex(today) - monthIndex(input.asOf);
  if (elapsed < 0) throw new Error("As-of month cannot be after today");
  const horizon = elapsed + 480;
  const mortgage = mortgageProjection(input.mortgage, input.asOf, horizon);
  const rows: MonthBreakdown[] = [];
  let savings = input.cash.savings;
  const savingsFactor = growthFactor(input.cash.interestRate, 1);
  for (let m = 0; m <= horizon; m++) {
    const date = addMonths(input.asOf, m);
    if (m > 0) savings = asPence(grow(savings, savingsFactor) + input.cash.monthlySaving);
    const inflation = growthFactor(input.growth.inflation, m);
    const real = (amount: Pence) => grow(amount, 1 / inflation);
    const salePrice = grow(input.homeValue, growthFactor(input.growth.home, m));
    const targetPrice = grow(input.targetPrice, growthFactor(input.growth.target, m));
    const loan = mortgage.months[m];
    if (loan === undefined) throw new Error(`Missing mortgage month ${m}`);
    const costs = input.costs.map((cost) => {
      let net: Pence;
      switch (cost.amount.kind) {
        case "fixed":
          net = grow(cost.amount.amount, inflation);
          break;
        case "sale-percent":
          net = atRate(salePrice, cost.amount.rate);
          break;
        case "purchase-percent":
          net = atRate(targetPrice, cost.amount.rate);
          break;
      }
      const tax = cost.plusVat ? atRate(net, vat.rate.value) : asPence(0);
      const total = asPence(net + tax);
      return {
        id: cost.id,
        name: cost.name,
        timing: cost.timing,
        net,
        vat: tax,
        total,
        todaysMoney: real(total),
      };
    });
    const totalCosts = (timing: "completion" | "upfront") =>
      costs
        .filter((c) => c.timing === timing)
        .reduce((sum, c) => asPence(sum + c.total), asPence(0));
    const completionCosts = totalCosts("completion");
    const upfrontCosts = totalCosts("upfront");
    const upfrontShortfall = asPence(Math.max(0, upfrontCosts - savings));
    const savingsLeft = asPence(Math.max(0, savings - upfrontCosts));
    const ercRate = input.mortgage.ercBands.find((band) => date <= band.until)?.rate;
    const earlyRepaymentCharge = ercRate === undefined ? asPence(0) : atRate(loan.balance, ercRate);
    // The exit fee is nominal: the spec only indexes fixed cost items and a fixed deposit.
    const exitFee = input.mortgage.exitFee;
    const tax = buyingTax(targetPrice, input.region === "scotland" ? lbtt : sdlt);
    const equityFromSale = asPence(salePrice - loan.balance - earlyRepaymentCharge - exitFee);
    const moneyAtCompletion = asPence(equityFromSale + savingsLeft);
    const leftForDeposit = asPence(moneyAtCompletion - completionCosts - tax);
    // A cash deposit cannot exceed the price; excess funds remain available after buying.
    const deposit = asPence(
      Math.min(
        targetPrice,
        input.deposit.kind === "percent"
          ? atRate(targetPrice, input.deposit.rate)
          : grow(input.deposit.amount, inflation),
      ),
    );
    const newMortgage = asPence(targetPrice - deposit);
    const leftOver = asPence(leftForDeposit - deposit);
    let borrowing: MonthBreakdown["borrowing"] = null;
    if (input.borrowingCheck !== null) {
      const check = input.borrowingCheck;
      const income = grow(check.annualIncome, growthFactor(check.incomeGrowth, m));
      const maximum = roundedRatio(BigInt(income) * BigInt(Math.round(check.multiple * 100)), 100n);
      borrowing = { income, maximum, sufficient: newMortgage <= maximum };
    }
    rows.push({
      month: date,
      salePrice,
      mortgageBalance: loan.balance,
      mortgagePayment: loan.payment,
      mortgageInterest: loan.interest,
      overpayment: loan.overpayment,
      earlyRepaymentCharge,
      exitFee,
      costs,
      completionCosts,
      buyingTax: tax,
      equityFromSale,
      moneyAtCompletion,
      leftForDeposit,
      targetPrice,
      deposit,
      newMortgage,
      savings,
      savingsLeft,
      upfrontCosts,
      upfrontShortfall,
      leftOver,
      borrowing,
      affordable: leftOver >= 0 && (borrowing?.sufficient ?? true),
      todaysMoney: {
        mortgageBalance: real(loan.balance),
        buyingTax: real(tax),
        completionCosts: real(completionCosts),
        savings: real(savings),
        upfrontShortfall: real(upfrontShortfall),
        earlyRepaymentCharge: real(earlyRepaymentCharge),
        exitFee: real(exitFee),
        salePrice: real(salePrice),
        targetPrice: real(targetPrice),
        deposit: real(deposit),
        newMortgage: real(newMortgage),
        equityFromSale: real(equityFromSale),
        savingsLeft: real(savingsLeft),
        moneyAtCompletion: real(moneyAtCompletion),
        leftForDeposit: real(leftForDeposit),
        leftOver: real(leftOver),
        upfrontCosts: real(upfrontCosts),
      },
    });
  }
  const breakdown = rows.find((row, m) => m >= elapsed && row.affordable) ?? null;
  const wait = breakdown === null ? null : monthIndex(breakdown.month) - monthIndex(today);
  const result: MoveDate =
    breakdown === null || wait === null
      ? { kind: "not-within-40-years" }
      : wait === 0
        ? { kind: "now", month: today }
        : {
            kind: "future",
            month: breakdown.month,
            years: Math.floor(wait / 12),
            months: wait % 12,
            monthsFromToday: wait,
          };
  const chartEnd = wait === null ? horizon : Math.min(horizon, elapsed + Math.max(60, wait + 24));
  return {
    result,
    breakdown,
    series: rows.slice(elapsed, chartEnd + 1),
    warnings: [{ kind: "buying-tax-assumed-unchanged" }, ...mortgage.warnings],
  };
}
