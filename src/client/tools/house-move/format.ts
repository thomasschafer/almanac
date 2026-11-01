import type { HouseMoveInputs } from "../../../shared/house-move/inputs.ts";
import { poundsFormat } from "../../ui/NumberInput.tsx";

export const gbp = (pence: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  })
    .format(pence / 100)
    .replace(/^-/, "−");

export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
}

export function costAmountLabel(cost: HouseMoveInputs["costs"][number]): string {
  let amount: string;
  switch (cost.amount.kind) {
    case "fixed":
      amount = `£${poundsFormat.format(cost.amount.amount)}`;
      break;
    case "sale-percent":
      amount = `${cost.amount.rate / 100}% of sale`;
      break;
    case "purchase-percent":
      amount = `${cost.amount.rate / 100}% of purchase`;
      break;
  }
  return `${amount}${cost.plusVat ? " + VAT" : ""}`;
}
