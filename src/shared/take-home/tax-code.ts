import type { Pence } from "../money.ts";
import type { TaxCode, TaxCodeBasis, TaxCodeUsed } from "./result.ts";
import type { IncomeTaxBands, TaxRegime } from "./rules/types.ts";

export type TaxCodeParse =
  { readonly ok: true; readonly code: TaxCode } | { readonly ok: false; readonly message: string };

const prefixes: Readonly<Record<string, TaxRegime>> = {
  "": "rest-of-uk",
  S: "scotland",
  C: "wales",
};
const regimeNames: Readonly<Record<TaxRegime, string>> = {
  "rest-of-uk": "England and Northern Ireland",
  scotland: "Scottish",
  wales: "Welsh",
};
const prefixOf: Readonly<Record<TaxRegime, string>> = {
  "rest-of-uk": "",
  scotland: "S",
  wales: "C",
};

const pattern =
  /^(?<prefix>[SC]?)(?:(?<number>\d{1,6})(?<suffix>[LMNT])|K(?<k>\d{1,6})|(?<br>BR)|D(?<d>\d)|(?<nt>NT))(?:[ /]?(?<basis>W1|M1|X))?$/;

const expected =
  "Tax codes look like 1257L, S1257L, 0T, BR, D0, K500 or NT, optionally followed by W1, M1 or X.";

/**
 * Parses a PAYE tax code as shown on a payslip. Invalid codes get a message for the user rather
 * than an exception, as they're usually typos.
 */
export function parseTaxCode(
  input: string,
  bandsFor: (regime: TaxRegime) => IncomeTaxBands,
): TaxCodeParse {
  const code = input.trim().toUpperCase();
  const groups = pattern.exec(code)?.groups;
  if (groups === undefined) {
    return { ok: false, message: `“${input}” isn't a tax code. ${expected}` };
  }
  const regime = prefixes[groups["prefix"] ?? ""];
  if (regime === undefined) {
    throw new Error(`unhandled tax code prefix in ${code}`);
  }
  const basis: TaxCodeBasis = groups["basis"] === undefined ? "cumulative" : "non-cumulative";
  const { number, suffix, k, br, d, nt } = groups;

  if (number !== undefined && suffix !== undefined) {
    if (number.length > 1 && number.startsWith("0")) {
      return { ok: false, message: `“${input}” has a leading zero. ${expected}` };
    }
    const value = Number(number);
    if (value === 0 && suffix !== "T") {
      return { ok: false, message: `A code with no allowance is written 0T, not 0${suffix}.` };
    }
    if (suffix !== "L" && suffix !== "M" && suffix !== "N" && suffix !== "T") {
      throw new Error(`unhandled tax code suffix in ${code}`);
    }
    return { ok: true, code: { kind: "allowance", regime, number: value, suffix, basis } };
  }
  if (k !== undefined) {
    const value = Number(k);
    if (value === 0 || k.startsWith("0")) {
      return { ok: false, message: `“${input}” isn't a K code: the number must start 1 to 9.` };
    }
    return { ok: true, code: { kind: "k", regime, number: value, basis } };
  }
  if (br !== undefined) {
    return { ok: true, code: { kind: "flat", regime, bandsAboveBasic: 0, basis } };
  }
  if (d !== undefined) {
    const bands = bandsFor(regime);
    const highest = bands.aboveBasic.length;
    const level = Number(d);
    if (level > highest) {
      return {
        ok: false,
        message: `There's no ${prefixOf[regime]}D${d} code for ${regimeNames[regime]} rates: the highest is ${prefixOf[regime]}D${String(highest)}.`,
      };
    }
    return { ok: true, code: { kind: "flat", regime, bandsAboveBasic: level + 1, basis } };
  }
  if (nt !== undefined) {
    if (regime !== "rest-of-uk") {
      return { ok: false, message: "NT applies across the UK and has no S or C prefix." };
    }
    return { ok: true, code: { kind: "no-tax", basis } };
  }
  throw new Error(`tax code pattern matched without a code: ${code}`);
}

export function formatTaxCode(code: TaxCode): string {
  const basis = code.basis === "non-cumulative" ? " M1" : "";
  switch (code.kind) {
    case "allowance":
      return `${prefixOf[code.regime]}${String(code.number)}${code.suffix}${basis}`;
    case "k":
      return `${prefixOf[code.regime]}K${String(code.number)}${basis}`;
    case "flat":
      return `${prefixOf[code.regime]}${code.bandsAboveBasic === 0 ? "BR" : `D${String(code.bandsAboveBasic - 1)}`}${basis}`;
    case "no-tax":
      return `NT${basis}`;
  }
}

/**
 * The code HMRC would issue for an allowance: the allowance in pounds without its last digit, with
 * L for the full personal allowance and T where it's been reduced. No allowance is 0T, and £1 to
 * £19 is code 1 (PAYE specification, paragraph 4.3.1).
 */
export function deriveTaxCode(
  allowance: Pence,
  fullAllowance: Pence,
  regime: TaxRegime,
): Extract<TaxCodeUsed, { source: "derived" }> {
  if (allowance < 0 || allowance > fullAllowance) {
    throw new Error(`allowance ${String(allowance)} is outside 0 to ${String(fullAllowance)}`);
  }
  const wholePounds = Math.floor(allowance / 100);
  const number = wholePounds === 0 ? 0 : Math.max(1, Math.floor(wholePounds / 10));
  const code: TaxCode =
    number === 0
      ? { kind: "allowance", regime, number: 0, suffix: "T", basis: "cumulative" }
      : {
          kind: "allowance",
          regime,
          number,
          suffix: allowance === fullAllowance ? "L" : "T",
          basis: "cumulative",
        };
  return {
    source: "derived",
    code,
    display: formatTaxCode(code),
    allowance: allowance === fullAllowance ? "full" : number === 0 ? "none" : "tapered",
  };
}
