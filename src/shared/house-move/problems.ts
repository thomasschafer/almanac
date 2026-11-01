import { hasProjectionHeadroom } from "./headroom.ts";
import type { HouseMoveInputs } from "./inputs.ts";
import { monthIndex, type Month } from "./months.ts";
import { MortgagePaymentError, mortgageProjection, paymentOverrideProblem } from "./mortgage.ts";

export type HouseMoveInputProblem = {
  readonly path: readonly (string | number)[];
  readonly message: string;
} & (
  | { readonly kind: "as-of-after-today" | "projection-headroom" | "unsupported-calendar" }
  | {
      readonly kind: "payment-below-interest";
      readonly minimumPayment: import("../money.ts").Pence;
    }
);

/** Calculation validity can change with time; saved figures keep their static shape. */
export function houseMoveInputProblems(
  inputs: HouseMoveInputs,
  today: Month,
): HouseMoveInputProblem[] {
  const current = monthIndex(today);
  const elapsed = current - monthIndex(inputs.asOf);
  const problems: HouseMoveInputProblem[] = [];
  if (elapsed < 0)
    problems.push({
      kind: "as-of-after-today",
      path: ["asOf"],
      message: "As-of month cannot be after today",
    });
  if (current + 480 > monthIndex("9999-12"))
    problems.push({
      kind: "unsupported-calendar",
      path: ["asOf"],
      message: "Projection ends outside the supported calendar",
    });
  if (elapsed >= 0 && !hasProjectionHeadroom(inputs, elapsed + 480))
    problems.push({
      kind: "projection-headroom",
      path: ["growth", "inflation"],
      message:
        "These figures, costs and growth assumptions exceed safe whole-pence arithmetic over the projection; reduce the amounts or growth, or use a more recent as-of month",
    });
  const payment = paymentOverrideProblem(inputs.mortgage, inputs.asOf);
  if (payment !== null)
    problems.push({
      ...payment,
      path: ["mortgage", "paymentOverride"],
      message: `Monthly payment must cover interest of £${(payment.minimumPayment / 100).toFixed(2)}`,
    });
  const fix = inputs.mortgage.fixedRate;
  if (problems.length === 0 && fix !== null && inputs.mortgage.paymentOverride !== null) {
    const fixEnd = monthIndex(fix.until) - monthIndex(inputs.asOf);
    // A fix ending after maturity cannot recalculate over a remaining contractual term.
    if (fixEnd >= inputs.mortgage.remainingMonths && fixEnd < elapsed + 480) {
      try {
        mortgageProjection(inputs.mortgage, inputs.asOf, fixEnd + 1);
      } catch (error) {
        if (!(error instanceof MortgagePaymentError)) throw error;
        problems.push({
          kind: "payment-below-interest",
          path: ["mortgage", "paymentOverride"],
          minimumPayment: error.minimumPayment,
          message: error.message,
        });
      }
    }
  }
  return problems;
}
