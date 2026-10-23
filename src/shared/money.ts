import { z } from "zod";

/** A whole number of pence. Money is stored and calculated in pence to avoid rounding drift. */
export const pence = z.number().int().brand<"Pence">();
export type Pence = z.infer<typeof pence>;

export const nonNegativePence = z.number().int().nonnegative().brand<"Pence">();

/** Converts pounds, as typed by the user, to pence. Fails on anything that isn't a finite amount. */
export function fromPounds(pounds: number): Pence {
  if (!Number.isFinite(pounds)) {
    throw new Error(`not a finite amount of money: ${String(pounds)}`);
  }
  return Math.round(pounds * 100) as Pence;
}

export function toPounds(amount: Pence): number {
  return amount / 100;
}

/** Brands a whole number of pence, failing loudly if it isn't one. */
export function asPence(value: number): Pence {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`not a whole number of pence: ${String(value)}`);
  }
  return value as Pence;
}
