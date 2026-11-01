import { asPence, type Pence } from "../money.ts";
import type { Rate, SignedRate } from "../rates.ts";

/** Round a non-negative exact rational to the nearest penny, halves upwards. */
export function roundedRatio(numerator: bigint, denominator: bigint): Pence {
  if (numerator < 0n || denominator <= 0n) throw new Error("Expected a non-negative ratio");
  return asPence(Number((numerator * 2n + denominator) / (denominator * 2n)));
}

export function atRate(amount: Pence, rate: Rate, divisor = 10_000): Pence {
  return roundedRatio(BigInt(amount) * BigInt(rate), BigInt(divisor));
}

/** Exact rational annuity, rounded once to pence; rate is nominal annual basis points. */
export function annuityPayment(balance: Pence, rate: Rate, months: number): Pence {
  if (balance < 0 || rate < 0 || !Number.isInteger(months) || months < 1)
    throw new Error("Invalid annuity inputs");
  if (rate === 0) return roundedRatio(BigInt(balance), BigInt(months));
  const denominator = 120_000n;
  const power = (denominator + BigInt(rate)) ** BigInt(months);
  return roundedRatio(
    BigInt(balance) * BigInt(rate) * power,
    denominator * (power - denominator ** BigInt(months)),
  );
}

export function growthFactor(rate: Rate | SignedRate, months: number): number {
  return (1 + rate / 10_000) ** (months / 12);
}

/** Growth factors are the only floating-point quantities used to scale money. */
export function grow(amount: Pence, factor: number): Pence {
  return asPence(Math.round(amount * factor));
}
