import { asPence, type Pence } from "../money.ts";
import { positivePart, rateOfForNi, sum } from "./arithmetic.ts";
import type { Rate } from "./rules/types.ts";

/**
 * Class 1 NI (category A) on one month's pay, by HMRC's exact percentage method. NI is worked out
 * on each pay period alone, never cumulatively for employees who aren't directors:
 * https://www.gov.uk/hmrc-internal-manuals/national-insurance-manual/nim01003
 */

export interface NiRates {
  readonly primaryThreshold: Pence;
  readonly upperEarningsLimit: Pence;
  readonly mainRate: Rate;
  readonly upperRate: Rate;
  readonly secondaryThreshold: Pence;
  readonly employerRate: Rate;
}

function between(pay: Pence, from: Pence, to: Pence): Pence {
  return positivePart(asPence(Math.min(pay, to) - from));
}

/** Each band's NI is rounded on its own, as in steps 7 and 8 of HMRC's formula. */
export function employeeNi(pay: Pence, rates: NiRates): Pence {
  return sum([
    rateOfForNi(between(pay, rates.primaryThreshold, rates.upperEarningsLimit), rates.mainRate),
    rateOfForNi(positivePart(asPence(pay - rates.upperEarningsLimit)), rates.upperRate),
  ]);
}

export function employerNi(pay: Pence, rates: NiRates): Pence {
  return sum([
    rateOfForNi(
      between(pay, rates.secondaryThreshold, rates.upperEarningsLimit),
      rates.employerRate,
    ),
    rateOfForNi(positivePart(asPence(pay - rates.upperEarningsLimit)), rates.employerRate),
  ]);
}

/** The employee rate on the next pound of a month's pay. */
export function marginalEmployeeNiRate(pay: Pence, rates: NiRates): Rate {
  if (pay < rates.primaryThreshold) {
    return 0 as Rate;
  }
  return pay < rates.upperEarningsLimit ? rates.mainRate : rates.upperRate;
}
