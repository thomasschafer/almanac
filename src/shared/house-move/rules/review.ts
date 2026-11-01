import type { Notice } from "../../notices.ts";
import { reviewEvents, reviewPatterns, ukDate } from "../../rule-review.ts";
import { lbtt, sdlt, type BuyingTaxRules } from "./index.ts";

export function houseMoveNotices(
  now: Date,
  rules: { sdlt: BuyingTaxRules; lbtt: BuyingTaxRules } = { sdlt, lbtt },
): Notice[] {
  const today = ukDate(now);
  const firstYear = Math.min(
    Number(rules.sdlt.lastReviewed.slice(0, 4)),
    Number(rules.lbtt.lastReviewed.slice(0, 4)),
  );
  return reviewEvents(firstYear, Number(today.slice(0, 4)) + 1).flatMap((event): Notice[] => {
    if (event.series !== "uk-budget" && event.series !== "scottish-budget") return [];
    const label = event.series === "uk-budget" ? "SDLT" : "LBTT";
    const rule = event.series === "uk-budget" ? rules.sdlt : rules.lbtt;
    if (event.date > today || event.date <= rule.lastReviewed) return [];
    const pattern = reviewPatterns[event.series];
    const when =
      event.dateStatus === "known"
        ? `was on ${event.date}`
        : `is usually ${pattern.usually}, so it has probably happened`;
    return [
      {
        id: `house-move:review-after:${event.id}`,
        severity: "warning",
        dismissible: true,
        title: `Check ${label} after the ${pattern.name}`,
        body: `The ${pattern.name} ${when}. It can change ${label}. These rules were last checked on ${rule.lastReviewed}.`,
      },
    ];
  });
}
