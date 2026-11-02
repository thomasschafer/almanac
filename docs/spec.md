# Spec

Almanac is a personal collection of small tools that don't each deserve their own app. It runs on
a laptop and is reached from a phone or the laptop itself over Tailscale. It's used by one
person, so there are no accounts: the server only accepts requests from the tailnet user the
laptop is signed in as.

The data (each tool's last state and its presets) lives in SQLite outside the repo and isn't
backed up. Losing it is an inconvenience, not a disaster.

## The shell

- The index (`/`) lists the tools as an index: each has a name, icon, identity colour and a
  one-line description. It shows no figures from inside tools. It also links to the other apps
  on the tailnet (Health, Workshop).
- A notification drawer collects notices from every tool, such as tax rules that are due a
  review, or state that hasn't saved.
- Phone first, but the laptop is a first-class layout rather than a stretched phone.
- It's a PWA, so it can be added to the home screen. It needs the laptop to be awake.

## Saved state and presets

Each tool keeps one current state, shared across devices: what you see when you come back is
what you left, wherever you left it. Edits save automatically, shortly after you stop typing,
or straight away when you leave the tool or the app goes to the background. Saves go one at a
time, so they reach the server in order. Edits are kept on the device until they're saved, and
every page and tab on the device shares them, so opening the tool again, in another tab or after
coming back to the app, never replaces edits that aren't saved yet with an older copy. While
any aren't, because a save failed or the tool was left before one finished, a notice says
so from any page. It can't be dismissed, as those edits could be lost. Presets are named copies of a tool's state that can be loaded, updated, renamed and deleted.
Renaming one only changes its name, so it keeps figures another device has updated it with.
Loading a preset replaces the current state.

State and presets are validated against the tool's schema in `src/shared` on the way in and out.
Changing a schema means handling state saved under the old one, never silently dropping it. Old
shapes are only accepted when reading stored state and each device's cached copy: the server
refuses to save anything but the current shape, so an out-of-date client can't overwrite newer
data. Its edits stay on the device, marked unsaved, until it updates.

## Take-home pay

Works out take-home pay in the UK for an employee, focused on England, with Scotland as an
option. It answers: what lands in my account each month, what goes into my pension, what goes to
tax, NI and student loans, and when will my student loan be repaid or written off?

### Inputs

Progressive: the basics are always shown, and the rest is in a "more options" sheet, so closing
it leaves the results in view.

- Basics: salary, bonus, pension contribution from each (with the pension type picked beside
  it: salary sacrifice, net pay or relief at source), and student loan plans with their balances.
- More options: tax year, Scotland, the bonus month, employer contribution and NI pass-on, the
  year repayments started (for write-off, or for repayments that haven't started yet), for Plan
  1 and Plan 4 whether the first loan was paid before the cutoff for older terms (or not sure), a
  tax code override, and the projection's assumptions (salary growth and RPI, either of which can
  be negative).

Results are worked out again as each keystroke makes a valid value; there's nothing to submit.
An empty field is 0, except a loan's balance or the year its repayments started, where empty
means not known: repayments still come out of pay, but when the loan ends can't be worked out.
While a field is being edited, the summary shows how take-home has changed since it was picked,
and keeps showing it for a few seconds after leaving it. While what's typed isn't a valid value,
the field says what it takes, and the results are dimmed and say they're waiting for it rather
than looking current. Leaving the field puts back its last valid value.

### What if

A second scenario to compare against the current figures, such as a pay rise, a different
pension contribution or a job offer. It starts as a copy of the current figures (or of a preset),
and the inputs switch between editing either. The comparison shows the change in monthly and
yearly take-home, pension, deductions and student loans; fields that differ show the other
scenario's value. The what-if can be adopted as the current figures, saved as a preset, or
dropped. It's saved with the tool's state, so it's the same on every device.

Out of scope for now: taxable benefits, the High Income Child Benefit Charge, other income,
self-employment, multiple jobs, directors' NI.

### Calculation

The engine in `src/shared/take-home` is pure and runs on the client, so results update as you
type. It simulates PAYE month by month, as payroll does, rather than dividing an annual figure
by 12:

- Income tax is cumulative across the tax year on normal codes (non-cumulative for W1/M1 codes).
- NI and student loan repayments are worked out on each month's pay alone. So a bonus month
  differs from a normal month: NI above the upper threshold drops to 2%, and the student loan
  deduction jumps.
- Salary sacrifice reduces the pay that tax, NI and student loans are worked out on. Net pay
  reduces taxable pay only. Relief at source is paid from net pay, with basic-rate relief added
  by the provider. Any relief above the basic rate isn't paid through payroll: it's claimed
  through Self Assessment or from HMRC, and the summary and breakdown show how much there is.
- A student loan whose repayments start in a later tax year (its first repayment year is after
  the tax year's start) has nothing taken that year, and the results say so.
- Amounts are whole pence and rounded as HMRC payroll does (student loan deductions round down
  to the pound).

The page works on today's date, brought up to date whenever it comes back into view, so an app
left open moves on to a new tax year or interest year when it's next looked at.

Results show a normal month (the most common net pay outside the bonus month, earliest on a
tie), the bonus month, and the year, with the breakdown of where the money goes. On a cumulative
code, months after a large bonus can refund tax taken earlier in the year: the normal month then
says it includes a refund, and the breakdown shows the refund as its own line, so the parts still
add up to the gross pay.

They show what another £1,000 a year of salary, or of bonus, would change: take-home, tax, NI,
each student loan and the pension. The year is worked out again with the extra pay, so the
figures are right where it crosses a threshold. The results also flag:

- where the personal allowance is being withdrawn (between £100,000 and £125,140 of adjusted net
  income in 2026/27), the effective rate that leaves (60%, or 67.5% on Scottish rates), and how
  much more pension contribution would get you out of it, with what that costs from pay for
  relief at source;
- pension contributions (yours and your employer's) above the annual allowance, which may mean
  an annual allowance charge unless there's carry-forward;
- figures that are provisional because the rules for that year aren't confirmed.

### Student loan projection

A chart of each loan's balance, year by year, from today's balance until it's repaid or written
off, with salary growing at the assumed rate and interest following each plan's rules (Plan 2's
income-linked rate included). It says which comes first, when, and the total you'd repay. A loan
whose repayments haven't started yet adds interest until 6 April of its first repayment year, and
only then has repayments taken; an unknown first repayment year is taken as already started.
Until then, Plan 2 adds interest at its rate while studying (RPI + 3%, under the same cap), and
only moves to the income-linked rate once repayments are due. A balance of 0 is shown as already
repaid.

Plan 1 and Plan 4 loans first paid before a cutoff (1 September 2006 and 1 August 2007) are
written off at 65 (Plan 4: at 65 or after 30 years, whichever comes first). The projection can't
date that, so unless the loan is known to be first paid on or after the cutoff, how it ends is
conditional: it says when it'd be repaid unless written off sooner, or for Plan 4 the latest
it's written off, and its totals say they hold unless it's written off sooner. Loans saved
before this was asked are read as not sure.

Its breakdown page (`/take-home/student-loans`) has a larger chart, what's repaid and added in
interest each tax year, and a table by tax year that opens out into each month's pay, interest
rate, interest, repayment and balance.

### Tax rules

Each tax year's rules are data in `src/shared/take-home/rules/`: thresholds, rates and plan
details, each with its source and whether it's confirmed or provisional, and the date the year
was last checked. Only years whose rules are known are included. A date in a year with no rules
is an error the tool shows, never a silent fallback to another year.

The rules need checking after each event that can change them: the UK Budget (autumn), the
Scottish Budget (December or January), HMRC's payroll figures (February or March) and the
student loan announcements (August, and interest from 1 September). Those dates are listed next
to the rules. The tool raises a notice when one has passed since the rules were last checked,
when next year's rules are missing from January, and if six months pass without a check. How to
do a review is in [tax-rules.md](tax-rules.md).

## House move

Works out when the next house can be bought with the equity in the current one: the date when
selling the current home, paying off its mortgage and paying every cost of the move leaves at
least the chosen deposit for the next one. A new mortgage covers the rest of the price, and
whether it can be had is assumed unless the borrowing check is turned on. It answers: how many
years and months until we can move, and where does the money go when we do? It's agnostic about
whose figures it holds; nothing about anyone's situation is built in beyond the defaults below.

The tool lives at `/house-move`.

### Inputs

Progressive, as take-home: the basics are always shown and the rest is in a "more options" sheet.
Amounts called today's money are in pounds of the month the figures are as of, and grow with
inflation; prices grow with their own growth rates.

- Basics: the current home's value, the mortgage balance, its rate and remaining term, a monthly
  overpayment, the target price (today's money) and the deposit for it, either a percentage of
  the price (default 25%) or a fixed amount.
- The current mortgage, in more options: the month the figures are as of (the balance is the one
  after that month's payment, and the home value and savings are from the same month), a monthly
  payment if it differs from the one the balance, rate and term give, when the fixed rate ends and the rate after it, early repayment charges as a
  percentage of the balance repaid until each of a list of months, an exit fee, one-off
  overpayments in given months, what overpayments do (shorten the term, the default, or lower the
  payment), and the yearly overpayment allowance during the fixed rate (default 10% of the
  balance at the start of each year of it).
- Growth: the current home's yearly price growth, the target's (each defaulting to 3%, and either
  can be negative) and inflation (default 2.5%), which fixed costs and the deposit amount in
  today's money grow with.
- Where the next home is: England or Northern Ireland (SDLT) or Scotland (LBTT), for the tax on
  buying it.
- Cash: savings in the month the figures are as of, saved each month, and their yearly interest rate.
- Costs: a list of named costs, each either a fixed amount in today's money or a percentage of the
  sale or purchase price, optionally plus VAT, and either paid at completion (out of the sale
  proceeds) or up front (before completion, so from cash). Costs can be added, edited and removed.
  The defaults are typical figures, and the tool says they're estimates:

  | Cost                     | Amount                  | Paid          |
  | ------------------------ | ----------------------- | ------------- |
  | Estate agent             | 1.25% of sale, plus VAT | at completion |
  | Conveyancing (sale)      | £1,500                  | at completion |
  | Conveyancing (purchase)  | £2,000                  | at completion |
  | Mortgage arrangement fee | £999                    | at completion |
  | Energy performance cert. | £90                     | up front      |
  | Searches                 | £400                    | up front      |
  | Survey                   | £700                    | up front      |
  | Mortgage broker          | £500                    | up front      |
  | Removals                 | £1,500                  | up front      |

  SDLT or LBTT, the early repayment charge and the exit fee aren't in the list: they're worked out
  or entered elsewhere, and always paid at completion.

- Borrowing check, off by default: gross yearly household income, its yearly growth, and the most
  a lender would lend as a multiple of it (default 4.5).

Results are worked out again as each keystroke makes a valid value, and fields behave as in
take-home: empty is 0, invalid values say what the field takes and dim the results, and leaving
the field puts back its last valid value. The figures as of month can't be after this month.
Amounts are limited to £100 million each, yearly growth and inflation to -20% through 20%,
mortgage and savings interest rates to 20%, and the income multiple to 10. Combinations of
figures, costs and growth that are too large to calculate safely over the whole projection say
so beside the inputs. Saved figures still load if time has made them unsuitable for a calculation;
the results wait for those inputs to be corrected.

### Calculation

The engine in `src/shared/house-move` is pure. It steps month by month from the figures as of
month, until 40 years from this month:

- Mortgage interest each month is the balance times the yearly rate over 12, in whole pence. The
  payment is the repayment (annuity) payment for the balance, rate and remaining term, or the
  monthly payment given, which must cover the interest. When the fixed rate ends, the payment is
  worked out again for the balance and the remaining term at the rate after it. The fixed rate
  applies through its end month; the payment changes the month after it ends. Overpayments
  either shorten the term (the payment stays the same) or lower the payment (it's worked out again
  over the remaining term after each overpayment). The last payment clears the balance exactly.
  Overpayments above the allowance during the fixed rate are shown as a warning, not prevented.
  If a monthly payment override leaves a balance at the end of the term, the payments and
  interest continue until it is paid off, and the results warn that the term has been exceeded.
- Early repayment charges apply through each band's end month: selling in that month still
  pays the charge. The exit fee stays at the amount entered; it does not grow with inflation.
- The sale price and the target price grow monthly at the equivalent of their yearly rates, and
  fixed costs and a fixed deposit with inflation.
- Savings earn interest monthly at the equivalent of their yearly rate (before tax), and add the
  monthly saving after it.
- SDLT or LBTT is worked out on the purchase price from the rules for the next home's location,
  at the rates for someone replacing their main home (no first-time buyer relief, and no
  surcharge for additional homes, as the current home is sold on the same day).

A month is affordable when the sale price, less the mortgage balance, the early repayment charge
in that month, the exit fee and every cost paid at completion, plus any savings left after paying
the costs paid up front, is at least the deposit; and, with the borrowing check on, the new
mortgage (the price less the deposit) is no more than the income multiple. The result is the
first affordable month from this month onwards, as a date and as years and months from now; or
now; or not within 40 years. A fixed deposit above the purchase price is capped at the price,
so the new mortgage is zero. Switching between a percentage and an amount converts the chosen
deposit at the target price entered, to the nearest basis point or penny.

The up-front costs are a separate figure, the cash needed before completion. They can't come
from the equity, which isn't released until completion. If savings don't cover them in the
result month, the results say how much short they are, but the date still stands.

### Results

- The date, and how long until then. Quieter today's-money figures sit beside the main amounts,
  unless they equal the nominal amount.
- "Where the money goes" reads as one running sum. The sale price less the mortgage balance left, early
  repayment charge and exit fee gives the equity from the sale. Adding savings left after
  up-front costs gives the money at completion. Subtracting each completion cost, in list order,
  and SDLT or LBTT gives what is left for the deposit. Subtracting the deposit gives what is left
  over. The deposit says whether it is a percentage of the price or fixed. ERC and exit fee rows
  are hidden when zero unless configured; costs say "incl. VAT" where it applies.
- Each running-sum line shows its sign, and subtotals have a rule above and are bold. Rounded
  line items add up to each displayed subtotal, in both nominal and today's money, and in the
  purchase equation. A negative amount left over is shown as a shortfall.
- Amounts are shown to the pound, so a displayed subtotal can differ from the exact figure by a pound or so; exact figures still drive affordability, the date and the chart.
- A separate "The purchase" block shows the deposit plus the new mortgage equals the target price.
- The cash needed before completion, and whether savings cover it.
- A chart of "Left for the deposit" against "Deposit needed" for each month, from now until a
  couple of years after the result (at least five years, at most 40), marking the result. Its
  readout also shows what is left over, or the shortfall, in the selected month.
- Warnings: overpayments over the allowance, a monthly payment that leaves the mortgage unpaid at
  the end of its term, and that the rules on buying tax are today's, assumed to stay the same.

Out of scope for now: buying before selling (bridging), porting the mortgage, interest-only and
part-and-part mortgages, help to buy and shared ownership, Wales (LTT), tax on savings interest,
and any gap between selling and buying.

### Buying tax rules

SDLT and LBTT bands are data in `src/shared/house-move/rules/`, each with its source and whether
it's confirmed, and the date they were last checked. They need checking after the UK Budget
(SDLT) and the Scottish Budget (LBTT), and the tool raises a notice when one has passed since the
last check, as take-home does for its rules.
