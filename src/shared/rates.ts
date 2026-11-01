/** A percentage held as whole basis points (1% is 100), so rate arithmetic stays exact. */
export type Rate = number & { readonly __brand: "Rate" };

function basisPoints(value: number): number {
  const points = Math.round(value * 100);
  if (!Number.isSafeInteger(points) || Math.abs(points - value * 100) > 1e-9) {
    throw new Error(`not a percentage to a basis point: ${String(value)}`);
  }
  return points;
}

/** Converts a percentage to a {@link Rate}, failing on anything finer than a basis point. */
export function percent(value: number): Rate {
  const points = basisPoints(value);
  if (points < 0) {
    throw new Error(`not a non-negative percentage to a basis point: ${String(value)}`);
  }
  return points as Rate;
}

export function ratePercent(rate: Rate): number {
  return rate / 100;
}

/** Signed basis points for growth assumptions; greater than -100% keeps growth defined. */
export type SignedRate = number & { readonly __brand: "SignedRate" };

export function signedPercent(value: number): SignedRate {
  const points = basisPoints(value);
  if (points <= -10_000) {
    throw new Error(`not a percentage above -100% to a basis point: ${String(value)}`);
  }
  return points as SignedRate;
}
