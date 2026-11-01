# Tax rules

How the take-home and house-move tools' rules are kept up to date. What the tools do with them
is in [spec.md](spec.md).

## Where they live

Take-home rules are in `src/shared/take-home/rules/`:

- `2026-27.ts`, `2027-28.ts` and so on: one module per tax year, with income tax, NI, student loan
  repayment and pension figures. Each value is `confirmed` or `provisional`, carries the URL it was
  checked against, and provisional values say why. Each year records `lastReviewed`.
- `registry.ts`: the years in order. The registry must have no gaps; it checks itself on import.
- `student-loans.ts`: rules that aren't tied to one tax year. Write-off terms (and the older
  terms for Plan 1 and Plan 4 loans first paid before a cutoff), each plan's interest rule (and
  Plan 2's different rule before repayments are due), the announced interest rates for each
  academic year, how repayment thresholds are expected to be uprated after the known years, and
  the cap on NI-free salary sacrifice from April 2029.
- `review.ts`: `takeHomeNotices`, which raises the notices described in the spec. The events,
  recurring patterns and UK date helpers are shared in `src/shared/rule-review.ts`.

House-move rules are in `src/shared/house-move/rules/`:

- `index.ts`: residential SDLT (England and Northern Ireland), residential LBTT (Scotland), their
  final-liability rounding rules, and standard-rate VAT. Each has its source, status and
  `lastReviewed`. These are for a replacement main residence sold on the same day, with no
  additional-property surcharge or first-time buyer relief.
- `review.ts`: `houseMoveNotices`, using the shared UK Budget and Scottish Budget events to ask
  for SDLT and LBTT reviews respectively. The notices clear when the affected rule's
  `lastReviewed` is on or after the event.

Both engines take thresholds and rates from the rule modules. `Sourced` and its helpers live in
`src/shared/sourced.ts`; whole basis-point rates live in `src/shared/rates.ts`.

## Sources

Prefer, in order: GOV.UK guidance for employers (for 2026/27,
[Rates and thresholds for employers](https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027)),
HMRC's
[PAYE tax table routines](https://www.gov.uk/government/publications/payroll-technical-specifications-income-tax)
and NI guidance for software developers, other GOV.UK pages and announcements, then legislation.
Only use other sources for event dates, and say so. Record the exact page beside each value.

For house move, use GOV.UK's
[residential SDLT rates](https://www.gov.uk/stamp-duty-land-tax/residential-property-rates),
Revenue Scotland's
[residential LBTT rates](https://revenue.scot/taxes/land-buildings-transaction-tax/residential-property)
and GOV.UK's [VAT rates](https://www.gov.uk/vat-rates). Sum the marginal band liabilities before
rounding the final buying tax down to whole pounds, as directed by
[HMRC SDLTM00050](https://www.gov.uk/hmrc-internal-manuals/stamp-duty-land-tax-manual/sdltm00050)
and section 9 of Revenue Scotland's
[conveyance or transfer return](https://revenue.scot/sites/default/files/RS-0001%20Conveyance%20or%20Transfer%20Return_5.pdf).
The house-move projection assumes these rules stay unchanged over its horizon.

## Reviewing after an event

When a notice asks for a review (or before 6 April for a new year):

1. Read what changed: the Budget documents, the Scottish Budget, HMRC's new rates page, or the
   student loan announcement.
2. Update the affected values, their sources and their status. A value becomes `confirmed` once
   it's published for the year or set in legislation with no change announced.
3. Set `lastReviewed` on every year you checked, even if nothing changed. That clears the notices
   for events before that date.
4. Add any newly announced event dates to `knownReviewEvents` in `src/shared/rule-review.ts`.
   Events without a known date are generated from the recurring pattern, with the same id, so a dismissed notice
   stays dismissed when its date becomes known.
5. Run `npm run check`. The rules tests check every value has a source, that provisional values
   say why, that monthly student loan thresholds match the annual ones, and that the 2026/27 bands
   match HMRC's PAYE specification.

For house move, review SDLT after the UK Budget and LBTT after the Scottish Budget, even if the
bands do not change. Update the affected rule's `lastReviewed`, sources and status; also check
VAT when a change is announced. The house-move rules tests cover band edges, whole-pound
rounding and the shared review events.

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
