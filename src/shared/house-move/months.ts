import { z } from "zod";

export const month = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Use YYYY-MM")
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    const m = Number(value.slice(5));
    return year >= 1 && m >= 1 && m <= 12;
  }, "Use a real calendar month");

export type Month = z.infer<typeof month>;

export function monthIndex(value: Month): number {
  month.parse(value);
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5)) - 1;
}

export function addMonths(value: Month, count: number): Month {
  const index = monthIndex(value) + count;
  if (!Number.isInteger(count)) throw new Error("Month count must be an integer");
  return month.parse(
    `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`,
  );
}
