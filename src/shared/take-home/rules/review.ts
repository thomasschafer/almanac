import type { Notice } from "../../notices.ts";
import { taxYearId, taxYearRegistry, type TaxYearRegistry } from "./registry.ts";

import { reviewEvents, reviewPatterns, ukDate, taxYearStartYearOf } from "../../rule-review.ts";
export {
  knownReviewEvents,
  reviewPatterns,
  reviewEvents,
  ukDate,
  taxYearStartYearOf,
  type ReviewEvent,
  type ReviewSeries,
} from "../../rule-review.ts";

function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`not a date: ${date}`);
  }
  const shifted = new Date(Date.UTC(year, month - 1 + months, day));
  return shifted.toISOString().slice(0, 10);
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/**
 * Notices about the take-home rules on `now`:
 * - an error if today's tax year has no rules;
 * - a warning for each event since a year's rules were last reviewed (while that year is current
 *   or still to come);
 * - from 1 January, a notice if next tax year's rules are missing;
 * - a warning if more than six months have passed since the latest review.
 */
export function takeHomeNotices(now: Date, registry: TaxYearRegistry = taxYearRegistry): Notice[] {
  const today = ukDate(now);
  const currentStartYear = taxYearStartYearOf(today);
  const has = (startYear: number) => registry.some((rules) => rules.startYear === startYear);
  const notices: Notice[] = [];

  if (!has(currentStartYear)) {
    const id = taxYearId(currentStartYear);
    notices.push({
      id: `take-home:no-rules:${id}`,
      severity: "error",
      dismissible: false,
      title: `No tax rules for ${id}`,
      body: `Take-home pay can't be worked out for ${id} until its rules are added.`,
    });
  }

  const firstStartYear = Math.min(...registry.map((rules) => rules.startYear));
  for (const event of reviewEvents(firstStartYear, currentStartYear + 1)) {
    if (event.date > today) {
      continue;
    }
    const stale = registry.filter(
      (rules) =>
        rules.lastReviewed < event.date && `${String(rules.startYear + 1)}-04-05` >= event.date,
    );
    if (stale.length === 0) {
      continue;
    }
    const pattern = reviewPatterns[event.series];
    const happened =
      event.dateStatus === "known"
        ? `The ${pattern.name} for ${event.forTaxYear} was on ${formatDate(event.date)}.`
        : `The ${pattern.name} for ${event.forTaxYear} is usually ${pattern.usually}, so it has probably happened.`;
    notices.push({
      id: `take-home:review-after:${event.id}`,
      severity: "warning",
      dismissible: true,
      title: `Check the tax rules after the ${pattern.name}`,
      body: `${happened} It can change ${pattern.affects}. The rules for ${stale.map((rules) => rules.id).join(" and ")} were last checked before it.`,
    });
  }

  const nextStartYear = currentStartYear + 1;
  if (today >= `${String(nextStartYear)}-01-01` && !has(nextStartYear)) {
    const id = taxYearId(nextStartYear);
    notices.push({
      id: `take-home:missing-rules:${id}`,
      severity: "info",
      dismissible: true,
      title: `Add the tax rules for ${id}`,
      body: `${id} starts on 6 April ${String(nextStartYear)} and its rules haven't been added yet.`,
    });
  }

  const latestReview = registry
    .map((rules) => rules.lastReviewed)
    .sort()
    .at(-1);
  if (latestReview === undefined) {
    throw new Error("the tax year registry is empty");
  }
  if (today > addMonths(latestReview, 6)) {
    notices.push({
      id: `take-home:stale-rules:${latestReview}`,
      severity: "warning",
      dismissible: true,
      title: "The tax rules haven't been checked for six months",
      body: `They were last checked on ${formatDate(latestReview)}.`,
    });
  }
  return notices;
}
