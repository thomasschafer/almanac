/** The id of the tax year starting on 6 April of `startYear`, such as "2026-27". */
export function taxYearId(startYear: number): string {
  if (!Number.isSafeInteger(startYear) || startYear < 1000 || startYear > 9998) {
    throw new Error(`not a tax year start: ${String(startYear)}`);
  }
  return `${String(startYear)}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/**
 * Events after which tax rules need checking, shared by take-home and house move. See
 * docs/tax-rules.md for how a review is done.
 */

export type ReviewSeries =
  | "uk-budget"
  | "scottish-budget"
  | "hmrc-payroll-figures"
  | "student-loan-thresholds"
  | "student-loan-interest";

interface SeriesPattern {
  readonly name: string;
  readonly affects: string;
  /** When the event for the tax year starting in April of `startYear` is usually over by. */
  readonly usuallyBy: (startYear: number) => string;
  readonly usually: string;
}

/** The recurring pattern of each kind of event. */
export const reviewPatterns: Readonly<Record<ReviewSeries, SeriesPattern>> = {
  "uk-budget": {
    name: "UK Budget",
    affects: "income tax, NI and pension rules for the next tax year",
    usuallyBy: (startYear) => `${String(startYear - 1)}-11-30`,
    usually: "in the autumn, by the end of November",
  },
  "scottish-budget": {
    name: "Scottish Budget",
    affects: "Scottish income tax bands for the next tax year",
    usuallyBy: (startYear) => `${String(startYear)}-01-31`,
    usually: "in December or January",
  },
  "hmrc-payroll-figures": {
    name: "HMRC's rates and thresholds for employers",
    affects: "the payroll figures for the next tax year, including student loan thresholds",
    usuallyBy: (startYear) => `${String(startYear)}-03-31`,
    usually: "in February or March",
  },
  "student-loan-thresholds": {
    name: "Student loan repayment threshold announcement",
    affects: "student loan thresholds for the next tax year and this year's interest rates",
    usuallyBy: (startYear) => `${String(startYear - 1)}-08-31`,
    usually: "in August",
  },
  "student-loan-interest": {
    name: "Student loan interest change",
    affects: "student loan interest rates, which change each 1 September",
    usuallyBy: (startYear) => `${String(startYear - 1)}-09-01`,
    usually: "on 1 September",
  },
};

export interface ReviewEvent {
  /** Stable for the event, whether its date is known or expected. */
  readonly id: string;
  readonly series: ReviewSeries;
  /** The tax year the event mostly sets rules for. */
  readonly forTaxYear: string;
  /** YYYY-MM-DD. */
  readonly date: string;
  /** Known dates are announced; expected ones are when the event is usually over by. */
  readonly dateStatus: "known" | "expected";
  readonly source?: string;
}

function eventId(series: ReviewSeries, forStartYear: number): string {
  return `${series}-${taxYearId(forStartYear)}`;
}

function known(
  series: ReviewSeries,
  forStartYear: number,
  date: string,
  source: string,
): ReviewEvent {
  return {
    id: eventId(series, forStartYear),
    series,
    forTaxYear: taxYearId(forStartYear),
    date,
    dateStatus: "known",
    source,
  };
}

/** Events whose dates have been announced or have happened. */
export const knownReviewEvents: readonly ReviewEvent[] = [
  known(
    "uk-budget",
    2026,
    "2025-11-26",
    "https://www.gov.uk/government/publications/budget-2025-document/budget-2025-html",
  ),
  known(
    "student-loan-thresholds",
    2027,
    "2026-08-10",
    "https://www.gov.uk/government/news/student-loans-interest-rates-and-repayment-threshold-announcement--7",
  ),
  known(
    "student-loan-interest",
    2027,
    "2026-09-01",
    "https://www.gov.uk/government/news/student-loans-interest-rates-and-repayment-threshold-announcement--7",
  ),
  known(
    "uk-budget",
    2027,
    "2026-10-28",
    "https://www.gov.uk/government/publications/budget-2026-document/budget-2026-html",
  ),
  known(
    "scottish-budget",
    2027,
    "2026-12-03",
    "https://www.parliament.scot/-/media/files/committees/session-7/finance-committee/correspondence/2026/20260901-draft-scottish-budget-timetable-sg-to-fpac.pdf",
  ),
];

const reviewSeries = Object.keys(reviewPatterns) as ReviewSeries[];

/**
 * The known events, plus an expected one from the recurring pattern for each series and tax year
 * up to `lastStartYear` that has no known date.
 */
export function reviewEvents(firstStartYear: number, lastStartYear: number): ReviewEvent[] {
  const events = [...knownReviewEvents];
  for (let startYear = firstStartYear; startYear <= lastStartYear; startYear++) {
    for (const series of reviewSeries) {
      const id = eventId(series, startYear);
      if (!events.some((event) => event.id === id)) {
        events.push({
          id,
          series,
          forTaxYear: taxYearId(startYear),
          date: reviewPatterns[series].usuallyBy(startYear),
          dateStatus: "expected",
        });
      }
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/** The date in the UK, as YYYY-MM-DD. */
export function ukDate(now: Date): string {
  if (Number.isNaN(now.getTime())) {
    throw new Error("not a valid date");
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((p) => p.type === type)?.value;
    if (value === undefined) {
      throw new Error(`no ${type} in the formatted date`);
    }
    return value;
  };
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The start year of the tax year a UK date (YYYY-MM-DD) falls in: tax years start on 6 April. */
export function taxYearStartYearOf(date: string): number {
  const year = Number(date.slice(0, 4));
  return date.slice(5) >= "04-06" ? year : year - 1;
}
