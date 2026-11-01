import { fromPounds as pounds, asPence, type Pence } from "../../money.ts";
import { percent, type Rate } from "../../rates.ts";
import { confirmed, type Sourced } from "../../sourced.ts";

export interface BuyingTaxRules {
  readonly lastReviewed: string;
  readonly bands: Sourced<readonly { readonly above: Pence; readonly rate: Rate }[]>;
  readonly rounding: Sourced<"down-to-pound">;
}

export const sdlt: BuyingTaxRules = {
  lastReviewed: "2026-11-01",
  bands: confirmed(
    [
      { above: pounds(0), rate: percent(0) },
      { above: pounds(125_000), rate: percent(2) },
      { above: pounds(250_000), rate: percent(5) },
      { above: pounds(925_000), rate: percent(10) },
      { above: pounds(1_500_000), rate: percent(12) },
    ],
    "https://www.gov.uk/stamp-duty-land-tax/residential-property-rates",
  ),
  rounding: confirmed(
    "down-to-pound",
    "https://www.gov.uk/hmrc-internal-manuals/stamp-duty-land-tax-manual/sdltm00050",
  ),
};

export const lbtt: BuyingTaxRules = {
  lastReviewed: "2026-11-01",
  bands: confirmed(
    [
      { above: pounds(0), rate: percent(0) },
      { above: pounds(145_000), rate: percent(2) },
      { above: pounds(250_000), rate: percent(5) },
      { above: pounds(325_000), rate: percent(10) },
      { above: pounds(750_000), rate: percent(12) },
    ],
    "https://revenue.scot/taxes/land-buildings-transaction-tax/residential-property",
    "Residential rates since 1 April 2021; replacement of main residence.",
  ),
  rounding: confirmed(
    "down-to-pound",
    "https://revenue.scot/sites/default/files/RS-0001%20Conveyance%20or%20Transfer%20Return_5.pdf",
    "Section 9: final tax rounded down to the nearest pound.",
  ),
};

export const vat = {
  lastReviewed: "2026-11-01",
  rate: confirmed(percent(20), "https://www.gov.uk/vat-rates"),
};

/** Sum exact band liabilities before rounding the final liability to whole pounds. */
export function buyingTax(price: Pence, rules: BuyingTaxRules): Pence {
  if (price < 0) throw new Error("Purchase price cannot be negative");
  let numerator = 0n;
  const bands = rules.bands.value;
  if (bands[0]?.above !== 0) throw new Error("Buying-tax bands must start at zero");
  for (const [i, band] of bands.entries()) {
    const next = bands[i + 1]?.above ?? price;
    if (i + 1 < bands.length && next <= band.above)
      throw new Error("Buying-tax bands must increase");
    numerator += BigInt(Math.max(0, Math.min(price, next) - band.above)) * BigInt(band.rate);
  }
  return asPence(Number((numerator / 1_000_000n) * 100n));
}
