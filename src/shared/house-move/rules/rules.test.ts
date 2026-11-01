import { describe, expect, it } from "vitest";
import { fromPounds as pounds } from "../../money.ts";
import { atRate } from "../arithmetic.ts";
import { buyingTax, lbtt, sdlt, vat } from "./index.ts";
import { houseMoveNotices } from "./review.ts";

describe("SDLT replacement of main residence", () => {
  it.each([
    [0, 0],
    [125000, 0],
    [125049, 0],
    [125050, 1],
    [200000, 1500],
    [250000, 2500],
    [450000, 12500],
    [925000, 36250],
    [1000000, 43750],
    [1500000, 93750],
    [2000000, 153750],
  ])("on £%s is £%s", (price, tax) => {
    expect(buyingTax(pounds(price), sdlt)).toBe(pounds(tax));
  });
});

describe("LBTT replacement of main residence", () => {
  it.each([
    [0, 0],
    [145000, 0],
    [145049.99, 0],
    [145050, 1],
    [200000, 1100],
    [250000, 2100],
    [300000, 4600],
    [325000, 5850],
    [450000, 18350],
    [750000, 48350],
    [875000, 63350],
  ])("on £%s is £%s", (price, tax) => {
    expect(buyingTax(pounds(price), lbtt)).toBe(pounds(tax));
  });

  it("adds the portions before rounding down, including fractional-penny tax", () => {
    // £105,000 × 2% + £75,000 × 5% + £125,009.99 × 10% = £18,350.999.
    expect(buyingTax(pounds(450009.99), lbtt)).toBe(pounds(18350));
  });
});

it("sources every buying rule and VAT", () => {
  for (const rule of [sdlt.bands, sdlt.rounding, lbtt.bands, lbtt.rounding, vat.rate]) {
    expect(rule.status).toBe("confirmed");
    expect(new URL(rule.source).protocol).toBe("https:");
  }
  expect(atRate(pounds(1250), vat.rate.value)).toBe(pounds(250));
});

it("fails loudly on malformed tax bands", () => {
  expect(() => buyingTax(pounds(-1), sdlt)).toThrow();
  expect(() => buyingTax(pounds(1000), { ...sdlt, bands: { ...sdlt.bands, value: [] } })).toThrow();
});

describe("house-move review notices", () => {
  it("is quiet after review and uses the shared known Scottish Budget date", () => {
    expect(houseMoveNotices(new Date("2026-11-01T12:00Z"))).toEqual([]);
    expect(houseMoveNotices(new Date("2026-12-02T12:00Z"))).toEqual([]);
    expect(houseMoveNotices(new Date("2026-12-03T12:00Z")).map((n) => n.id)).toEqual([
      "house-move:review-after:scottish-budget-2027-28",
    ]);
  });

  it("includes SDLT after the UK Budget and clears reviewed events", () => {
    const stale = { sdlt: { ...sdlt, lastReviewed: "2026-10-01" }, lbtt };
    expect(houseMoveNotices(new Date("2026-10-27T12:00Z"), stale)).toEqual([]);
    expect(houseMoveNotices(new Date("2026-10-28T12:00Z"), stale)[0]?.id).toBe(
      "house-move:review-after:uk-budget-2027-28",
    );
    const reviewed = {
      sdlt: { ...sdlt, lastReviewed: "2026-12-04" },
      lbtt: { ...lbtt, lastReviewed: "2026-12-04" },
    };
    expect(houseMoveNotices(new Date("2026-12-04T12:00Z"), reviewed)).toEqual([]);
  });

  it("uses recurring events and UK dates", () => {
    const ids = houseMoveNotices(new Date("2027-12-01T00:00Z")).map((n) => n.id);
    expect(ids).toContain("house-move:review-after:uk-budget-2028-29");
    expect(() => houseMoveNotices(new Date("invalid"))).toThrow();
  });
});
