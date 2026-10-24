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
  year repayments started (for write-off, or for repayments that haven't started yet), a tax
  code override, and the projection's assumptions (salary growth and RPI, either of which can be
  negative).

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
add up to the gross pay. They also flag:

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
