import type { Pence } from "../../../shared/money.ts";

const whole = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});
const exact = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
});

/** Whole pounds, rounded to the nearest: "£3,960". */
export function gbp(amount: Pence | number): string {
  return whole.format(Math.round(amount / 100));
}

/** Pounds and pence: "£3,959.49". */
export function gbpExact(amount: Pence | number): string {
  return exact.format(amount / 100);
}

/** A signed difference: "+£120", "−£45", "£0". */
export function gbpChange(amount: number): string {
  const rounded = Math.round(amount / 100);
  if (rounded === 0) return "£0";
  return `${rounded > 0 ? "+" : "−"}${whole.format(Math.abs(rounded))}`;
}

export function percent(value: number, digits = 0): string {
  return `${value.toFixed(digits).replace(/\.0+$/, "")}%`;
}

const monthNames = [
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "January",
  "February",
  "March",
] as const;

/** The name of a month of the tax year: 1 is April, 12 is March. */
export function taxMonthName(month: number): string {
  const name = monthNames[month - 1];
  if (name === undefined) throw new Error(`not a month of the tax year: ${String(month)}`);
  return name;
}

export function taxMonthShort(month: number): string {
  return taxMonthName(month).slice(0, 3);
}

/** "2026-27" as "2026/27". */
export function taxYearLabel(id: string): string {
  return id.replace("-", "/");
}

const monthYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const dayMonthYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** A YYYY-MM-DD date as "April 2032". */
export function formatMonthYear(date: string): string {
  return monthYear.format(new Date(`${date}T12:00:00Z`));
}

export function formatDay(date: string): string {
  return dayMonthYear.format(new Date(`${date}T12:00:00Z`));
}
