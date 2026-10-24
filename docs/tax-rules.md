# Tax rules

How the take-home tool's rules are kept up to date. What the tool does with them is in
[spec.md](spec.md#take-home-pay).

## Where they live

Everything is in `src/shared/take-home/rules/`:

- `2026-27.ts`, `2027-28.ts` and so on: one module per tax year, with income tax, NI, student loan
  repayment and pension figures. Each value is `confirmed` or `provisional`, carries the URL it was
  checked against, and provisional values say why. Each year records `lastReviewed`.
- `registry.ts`: the years in order. The registry must have no gaps; it checks itself on import.
- `student-loans.ts`: rules that aren't tied to one tax year. Write-off terms, each plan's interest
  rule, the announced interest rates for each academic year, how repayment thresholds are expected
  to be uprated after the known years, and the cap on NI-free salary sacrifice from April 2029.
- `review.ts`: the events after which the rules need checking, and `takeHomeNotices`, which raises
  the notices described in the spec.

The engine never hard-codes a threshold or rate. If a figure isn't in these modules, the engine
can't use it.

## Sources

Prefer, in order: GOV.UK guidance for employers (for 2026/27,
[Rates and thresholds for employers](https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027)),
HMRC's
[PAYE tax table routines](https://www.gov.uk/government/publications/payroll-technical-specifications-income-tax)
and NI guidance for software developers, other GOV.UK pages and announcements, then legislation.
Only use other sources for event dates, and say so. Record the exact page beside each value.

## Reviewing after an event

When a notice asks for a review (or before 6 April for a new year):

1. Read what changed: the Budget documents, the Scottish Budget, HMRC's new rates page, or the
   student loan announcement.
2. Update the affected values, their sources and their status. A value becomes `confirmed` once
   it's published for the year or set in legislation with no change announced.
3. Set `lastReviewed` on every year you checked, even if nothing changed. That clears the notices
   for events before that date.
4. Add any newly announced event dates to `knownReviewEvents` in `review.ts`. Events without a
   known date are generated from the recurring pattern, with the same id, so a dismissed notice
   stays dismissed when its date becomes known.
5. Run `npm run check`. The rules tests check every value has a source, that provisional values
   say why, that monthly student loan thresholds match the annual ones, and that the 2026/27 bands
   match HMRC's PAYE specification.

## Adding a tax year

Copy the latest year's module and add it to the registry. Carry each value forward with
`carriedForward` (provisional) unless it's known for the new year, in which case use `confirmed`
or `unchanged` with the source that says so. Scottish bands are announced in the Scottish Budget,
and HMRC's payroll figures, including monthly thresholds, usually appear in February or March.

Monthly student loan thresholds are the annual figure divided by 12 and truncated to the penny,
as HMRC publishes them. Monthly NI thresholds are rounded differently, so take them from HMRC's
table rather than working them out.

When interest rates for a new academic year are announced (usually August, from 1 September), add
an entry to `interestYears`.

## What's assumed beyond the known years

The student loan projection runs past the last year in the registry. It takes the latest year's
rules and uprates each repayment threshold by its plan's rule using the assumed RPI: Plan 1, 4
and 5 rise with RPI, rounded up to £5; Plan 2 is frozen to 2029/30 and then assumed to rise with
RPI; the Postgraduate Loan threshold is fixed. Interest follows each plan's rule with the assumed
RPI. The 6% cap on Plan 2 and Postgraduate Loan interest is only announced for the 2026/27
academic year (to 31 August 2027); the projection assumes it continues after that. The
projection lists these assumptions alongside its results, so update the wording there if a rule
changes.
