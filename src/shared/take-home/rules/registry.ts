import { taxYearId } from "../../rule-review.ts";
export { taxYearId } from "../../rule-review.ts";
import { rules2026To27 } from "./2026-27.ts";
import { rules2027To28 } from "./2027-28.ts";
import type { TaxYearRules } from "./types.ts";

/** Tax years whose rules are known, oldest first, with no gaps. */
export type TaxYearRegistry = readonly TaxYearRules[];

export const taxYearRegistry: TaxYearRegistry = [rules2026To27, rules2027To28];

export function startYearOfTaxYear(id: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(id);
  const startYear = Number(match?.[1]);
  if (match === null || taxYearId(startYear) !== id) {
    throw new Error(`not a tax year id: ${id}`);
  }
  return startYear;
}

export function findTaxYearRules(registry: TaxYearRegistry, id: string): TaxYearRules | undefined {
  return registry.find((rules) => rules.id === id);
}

/** Fails loudly if the registry isn't in order, has gaps, or has inconsistent ids. */
export function assertValidRegistry(registry: TaxYearRegistry): void {
  if (registry.length === 0) {
    throw new Error("the tax year registry is empty");
  }
  registry.forEach((rules, index) => {
    if (rules.id !== taxYearId(rules.startYear)) {
      throw new Error(`tax year ${rules.id} has start year ${String(rules.startYear)}`);
    }
    const before = registry[index - 1];
    if (before !== undefined && rules.startYear !== before.startYear + 1) {
      throw new Error(`tax year ${rules.id} doesn't follow ${before.id}`);
    }
  });
}

assertValidRegistry(taxYearRegistry);
