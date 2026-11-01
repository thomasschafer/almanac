import { asPence, type Pence } from "../../../shared/money.ts";
import type { MonthBreakdown } from "../../../shared/house-move/result.ts";

export type LedgerField =
  | "salePrice"
  | "mortgageBalance"
  | "earlyRepaymentCharge"
  | "exitFee"
  | "equityFromSale"
  | "savingsLeft"
  | "moneyAtCompletion"
  | "buyingTax"
  | "leftForDeposit"
  | "deposit"
  | "leftOver"
  | "newMortgage"
  | "targetPrice"
  | `cost:${string}`;

export interface DisplayLedgerRow {
  readonly field: LedgerField;
  readonly name: string;
  readonly operation: "+" | "−" | "=";
  /** Signed whole-pound amounts, still represented in pence for the shared formatters. */
  readonly value: Pence;
  readonly todaysMoney: Pence;
}

/** Round leaves once, then add them in each column; these totals never feed the engine. */
export function displayLedger(row: MonthBreakdown): {
  readonly move: readonly DisplayLedgerRow[];
  readonly purchase: readonly DisplayLedgerRow[];
} {
  const rounded = (value: Pence) => asPence(Math.round(value / 100) * 100);
  function ledger() {
    const rows: DisplayLedgerRow[] = [];
    let value = asPence(0);
    let todaysMoney = asPence(0);
    return {
      rows,
      leaf(field: LedgerField, name: string, operation: "+" | "−", nominal: Pence, real: Pence) {
        const sign = operation === "+" ? 1 : -1;
        const amount = asPence(sign * rounded(nominal));
        const realAmount = asPence(sign * rounded(real));
        value = asPence(value + amount);
        todaysMoney = asPence(todaysMoney + realAmount);
        rows.push({ field, name, operation, value: amount, todaysMoney: realAmount });
      },
      subtotal(field: LedgerField, name: string) {
        rows.push({ field, name, operation: "=", value, todaysMoney });
      },
    };
  }
  const real = row.todaysMoney;
  const move = ledger();
  move.leaf("salePrice", "Sale price", "+", row.salePrice, real.salePrice);
  move.leaf("mortgageBalance", "Mortgage paid off", "−", row.mortgageBalance, real.mortgageBalance);
  move.leaf(
    "earlyRepaymentCharge",
    "Early repayment charge",
    "−",
    row.earlyRepaymentCharge,
    real.earlyRepaymentCharge,
  );
  move.leaf("exitFee", "Exit fee", "−", row.exitFee, real.exitFee);
  move.subtotal("equityFromSale", "Equity from the sale");
  move.leaf(
    "savingsLeft",
    "Savings left after up-front costs",
    "+",
    row.savingsLeft,
    real.savingsLeft,
  );
  move.subtotal("moneyAtCompletion", "Money at completion");
  for (const cost of row.costs) {
    if (cost.timing === "completion")
      move.leaf(
        `cost:${cost.id}`,
        `${cost.name}${cost.vat > 0 ? " (incl. VAT)" : ""}`,
        "−",
        cost.total,
        cost.todaysMoney,
      );
  }
  move.leaf("buyingTax", "Buying tax", "−", row.buyingTax, real.buyingTax);
  move.subtotal("leftForDeposit", "Left for the deposit");
  move.leaf("deposit", "Deposit", "−", row.deposit, real.deposit);
  move.subtotal("leftOver", "Left over");

  const purchase = ledger();
  purchase.leaf("deposit", "Deposit", "+", row.deposit, real.deposit);
  purchase.leaf("newMortgage", "New mortgage", "+", row.newMortgage, real.newMortgage);
  purchase.subtotal("targetPrice", "Target price");
  return { move: move.rows, purchase: purchase.rows };
}
