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
what you left, wherever you left it. Edits save automatically, shortly after you stop typing.
Presets are named copies of a tool's state that can be loaded, updated, renamed and deleted.
Loading a preset replaces the current state.

State and presets are validated against the tool's schema in `src/shared` on the way in and out.
Changing a schema means handling state saved under the old one, never silently dropping it.

## Take-home pay

Works out take-home pay in the UK for an employee, focused on England, with Scotland as an
option. It answers: what lands in my account each month, what goes into my pension, what goes to
tax, NI and student loans, and when will my student loan be repaid or written off?

### Inputs

Progressive: the basics are always shown, and the rest is behind "more options".

- Basics: salary, bonus, pension contribution, student loan plan and balance.
- More options: tax year, Scotland, the bonus month, pension method (salary sacrifice, net pay,
  relief at source), sacrificing the bonus, employer contribution and NI pass-on, more than one
  student loan plan, the year repayments started (for write-off), a tax code override, and the
  projection's assumptions (salary growth, RPI).

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
  by the provider and higher-rate relief claimed separately (shown, not paid through payroll).
- Amounts are whole pence and rounded as HMRC payroll does (student loan deductions round down
  to the pound).

Results show a normal month, the bonus month, and the year, with the breakdown of where the
money goes. They also flag:

- the effective 60% rate between £100,000 and £125,140 of adjusted net income, and how much
  more pension contribution would get you out of it;
- pension contributions (yours and your employer's) above the annual allowance, which may mean
  an annual allowance charge unless there's carry-forward;
- figures that are provisional because the rules for that year aren't confirmed.

### Student loan projection

A chart of each loan's balance, year by year, from today's balance until it's repaid or written
off, with salary growing at the assumed rate and interest following each plan's rules (Plan 2's
income-linked rate included). It says which comes first, when, and the total you'd repay.

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
