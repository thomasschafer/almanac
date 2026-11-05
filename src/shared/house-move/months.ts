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

/** The month `count` months on from `value`, or null if it's outside years 1 to 9999. */
export function tryAddMonths(value: Month, count: number): Month | null {
  if (!Number.isInteger(count)) throw new Error("Month count must be an integer");
  const index = monthIndex(value) + count;
  const result = month.safeParse(
    `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`,
  );
  return result.success ? result.data : null;
}

export function addMonths(value: Month, count: number): Month {
  const result = tryAddMonths(value, count);
  if (result === null) throw new Error(`${value} plus ${String(count)} months isn't a real month`);
  return result;
}
