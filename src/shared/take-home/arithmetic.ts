import { asPence, type Pence } from "../money.ts";
import type { Rate } from "./rules/types.ts";

/** Basis points in a whole: a {@link Rate} of 10,000 is 100%. */
export const wholeRate = 10_000;

function checked(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`arithmetic left the safe integer range: ${String(value)}`);
  }
  return value;
}

export function sum(values: readonly Pence[]): Pence {
  return asPence(values.reduce((total, value) => checked(total + value), 0));
}

export function minus(a: Pence, b: Pence): Pence {
  return asPence(a - b);
}

export function positivePart(value: Pence): Pence {
  return asPence(Math.max(0, value));
}

/** `amount` at `rate`, rounded down to the penny. */
export function rateOfDown(amount: Pence, rate: Rate): Pence {
  return asPence(Math.floor(checked(amount * rate) / wholeRate));
}

/** `amount` at `rate`, rounded to the nearest penny. */
export function rateOfNearest(amount: Pence, rate: Rate): Pence {
  return asPence(Math.round(checked(amount * rate) / wholeRate));
}

/**
 * `amount` at `rate`, rounded as NI law requires: to the nearest penny, with a halfpenny or less
 * disregarded. HMRC only looks at the third decimal place of a pound, so £67.5558 is £67.55 and
 * £67.5568 is £67.56 (NI guidance for software developers, section 4).
 */
export function rateOfForNi(amount: Pence, rate: Rate): Pence {
  const tenThousandthsOfAPenny = checked(amount * rate);
  const pence = Math.floor(tenThousandthsOfAPenny / wholeRate);
  const tenthsOfAPenny = Math.floor(tenThousandthsOfAPenny / 1_000) % 10;
  return asPence(tenthsOfAPenny >= 6 ? pence + 1 : pence);
}

export function floorToPound(amount: Pence): Pence {
  return asPence(Math.floor(amount / 100) * 100);
}

/** A user-entered percentage of an amount, rounded to the nearest penny. */
export function percentOf(amount: Pence, percent: number): Pence {
  return asPence(Math.round((amount * percent) / 100));
}

/**
 * Splits an annual amount into 12 monthly ones: an equal share each month, with any pence left
 * over paid in the last month so the year adds up exactly.
 */
export function splitAcrossMonths(annual: Pence): Pence[] {
  const monthly = Math.floor(annual / 12);
  return Array.from({ length: 12 }, (_, index) =>
    asPence(index === 11 ? annual - monthly * 11 : monthly),
  );
}

/** The rate as a fraction of one, for marginal and effective rate maths. */
export function fraction(rate: Rate): number {
  return rate / wholeRate;
}

/** The item at `index`, failing loudly if there isn't one. */
export function itemAt<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`no item at index ${String(index)} of ${String(items.length)}`);
  }
  return item;
}
