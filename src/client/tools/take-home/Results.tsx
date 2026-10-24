import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import { useState } from "react";
import type { Pence } from "../../../shared/money.ts";
import type {
  InputIssue,
  MarginalRates,
  PayBreakdown,
  TakeHomeCalculation,
  TakeHomeFlag,
} from "../../../shared/take-home/result.ts";
import { studentLoanPlanRules } from "../../../shared/take-home/rules/student-loans.ts";
import { Segmented } from "../../ui/Segmented.tsx";
import { gbp, gbpExact, percent, taxMonthName, taxMonthShort, taxYearLabel } from "./format.ts";

/** Money you pay into your pension out of your pay, whatever the method. */
export function pensionFromPay(pay: PayBreakdown): number {
  return pay.grossPay - pay.netPay - pay.incomeTax - pay.nationalInsurance - pay.studentLoanTotal;
}

function Pounds({ amount, className }: { amount: Pence | number; className?: string }) {
  const [pounds, pence] = gbpExact(amount).split(".");
  return (
    <span className={`num ${className ?? ""}`}>
      {pounds}
      <span className="pence">.{pence}</span>
    </span>
  );
}

export function Summary({ result }: { result: TakeHomeCalculation }) {
  const { normalMonth, bonusMonth, annual, nonBonusNetPayRange: range } = result;
  const varies = range.max - range.min >= 100;
  return (
    <section className="panel summary" aria-label="Take-home pay">
      <div className="summary-main">
        <p className="kicker">Take-home, a normal month</p>
        <p className="hero-figure">
          <Pounds amount={normalMonth.netPay} />
        </p>
        {varies && (
          <p className="summary-note">
            Varies from <span className="num">{gbp(range.min)}</span> to{" "}
            <span className="num">{gbp(range.max)}</span> as tax evens out over the year
          </p>
        )}
      </div>
      <dl className="summary-cells">
        {bonusMonth !== null && (
          <div>
            <dt>In {taxMonthName(bonusMonth.month)}, with bonus</dt>
            <dd className="num">{gbp(bonusMonth.netPay)}</dd>
          </div>
        )}
        <div>
          <dt>Over the year</dt>
          <dd className="num">{gbp(annual.netPay)}</dd>
        </div>
        <div>
          <dt>Into your pension a year</dt>
          <dd className="num">{gbp(annual.pension.total)}</dd>
        </div>
      </dl>
    </section>
  );
}

/** A slim summary that stays at the top of a phone screen while the inputs are edited. */
export function StickySummary({
  result,
  visible,
}: {
  result: TakeHomeCalculation;
  visible: boolean;
}) {
  return (
    <div className={`sticky-summary${visible ? " visible" : ""}`} aria-hidden={!visible}>
      <span className="sticky-label">A month</span>
      <span className="num sticky-figure">{gbp(result.normalMonth.netPay)}</span>
      {result.bonusMonth !== null && (
        <>
          <span className="sticky-label">{taxMonthShort(result.bonusMonth.month)}</span>
          <span className="num">{gbp(result.bonusMonth.netPay)}</span>
        </>
      )}
      <span className="sticky-label">Year</span>
      <span className="num">{gbp(result.annual.netPay)}</span>
    </div>
  );
}

type Period = "year" | "month" | "bonus";

export function Breakdown({ result }: { result: TakeHomeCalculation }) {
  const [period, setPeriod] = useState<Period>("year");
  const [hovered, setHovered] = useState<string | null>(null);
  const shownPeriod = period === "bonus" && result.bonusMonth === null ? "year" : period;
  const pay =
    shownPeriod === "year"
      ? result.annual
      : shownPeriod === "month"
        ? result.normalMonth
        : (result.bonusMonth ?? result.annual);

  const parts = [
    { id: "take-home", label: "Take-home", amount: pay.netPay, color: "var(--series-1)" },
    { id: "pension", label: "Your pension", amount: pensionFromPay(pay), color: "var(--series-3)" },
    { id: "tax", label: "Income tax", amount: pay.incomeTax, color: "var(--neutral-1)" },
    {
      id: "ni",
      label: "National Insurance",
      amount: pay.nationalInsurance,
      color: "var(--neutral-2)",
    },
    {
      id: "loans",
      label: "Student loans",
      amount: pay.studentLoanTotal,
      color: "var(--neutral-3)",
    },
  ].filter((part) => part.amount > 0);
  const total = parts.reduce((sum, part) => sum + part.amount, 0);
  const employerSide = pay.pension.total - pensionFromPay(pay);

  return (
    <section className="panel" aria-labelledby="breakdown-heading">
      <div className="panel-head">
        <h2 id="breakdown-heading" className="kicker">
          Where your <span className="num">{gbp(pay.grossPay)}</span> goes
        </h2>
        <Segmented
          label="Period"
          hideLabel
          value={shownPeriod}
          options={[
            { value: "year", label: "Year" },
            { value: "month", label: "Month" },
            ...(result.bonusMonth === null
              ? []
              : [{ value: "bonus" as const, label: taxMonthShort(result.bonusMonth.month) }]),
          ]}
          onChange={setPeriod}
        />
      </div>
      {total > 0 ? (
        <>
          <div className="stack-bar" role="img" aria-label="Breakdown of gross pay">
            {parts.map((part) => (
              <span
                key={part.id}
                title={`${part.label}: ${gbp(part.amount)}`}
                className={hovered !== null && hovered !== part.id ? "dim" : undefined}
                style={{ flexGrow: part.amount, background: part.color }}
                onPointerEnter={() => {
                  setHovered(part.id);
                }}
                onPointerLeave={() => {
                  setHovered(null);
                }}
              />
            ))}
          </div>
          <table className="legend-table">
            <tbody>
              {parts.map((part) => (
                <tr
                  key={part.id}
                  className={hovered === part.id ? "hovered" : undefined}
                  onPointerEnter={() => {
                    setHovered(part.id);
                  }}
                  onPointerLeave={() => {
                    setHovered(null);
                  }}
                >
                  <td>
                    <span className="swatch" style={{ background: part.color }} />
                    {part.label}
                  </td>
                  <td className="num">{gbp(part.amount)}</td>
                  <td className="num muted">{percent((part.amount / total) * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {employerSide > 0 && (
            <p className="panel-note">
              {result.annual.pension.method === "relief-at-source"
                ? "Your employer and provider add"
                : "Your employer adds"}{" "}
              <span className="num">{gbp(employerSide)}</span>, so{" "}
              <span className="num">{gbp(pay.pension.total)}</span> goes into your pension.
            </p>
          )}
        </>
      ) : (
        <p className="empty">Add your salary to see where it goes.</p>
      )}
    </section>
  );
}

export function NextPound({ result }: { result: TakeHomeCalculation }) {
  const hasBonus = result.bonusMonth !== null;
  const [of, setOf] = useState<"salary" | "bonus">("salary");
  const rates: MarginalRates = result.marginalRates[hasBonus ? of : "salary"];
  const per = (p: number) => gbp(p * 1000);
  const rows = [
    { label: "Income tax", percent: rates.incomeTaxPercent },
    { label: "National Insurance", percent: rates.nationalInsurancePercent },
    ...rates.studentLoans.map((l) => ({
      label: studentLoanPlanRules[l.plan].name,
      percent: l.percent,
    })),
    { label: "Your pension", percent: rates.pensionPercent },
  ].filter((r) => r.percent > 0.005);

  return (
    <section className="panel" aria-labelledby="next-heading">
      <div className="panel-head">
        <h2 id="next-heading" className="kicker">
          The next £1,000
        </h2>
        {hasBonus && (
          <Segmented
            label="Of"
            hideLabel
            value={of}
            options={[
              { value: "salary", label: "Salary" },
              { value: "bonus", label: "Bonus" },
            ]}
            onChange={setOf}
          />
        )}
      </div>
      <p className="lede">
        You'd keep <span className="num strong">{per(rates.takeHomePercent)}</span> of another
        £1,000 of {hasBonus ? of : "salary"}.
      </p>
      <table className="legend-table compact">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td className="num">{per(row.percent)}</td>
              <td className="num muted">{percent(row.percent, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function Insights({ result }: { result: TakeHomeCalculation }) {
  const items = result.flags.map((flag) => flagInsight(flag, result));
  const taxCode = result.taxCode;
  return (
    <>
      {items.map((item) => (
        <Callout key={item.key} severity={item.severity} title={item.title}>
          {item.body}
        </Callout>
      ))}
      <p className="fine-print">
        {taxYearLabel(result.taxYear)} rules. Tax code{" "}
        <span className="num">{taxCode.display}</span>
        {taxCode.source === "derived"
          ? taxCode.allowance === "tapered"
            ? ", worked out from your reduced allowance."
            : taxCode.allowance === "none"
              ? ", as your allowance is used up."
              : ", the standard code."
          : ", from your override."}
      </p>
    </>
  );
}

export function Issues({ issues }: { issues: readonly InputIssue[] }) {
  return (
    <>
      {issues.map((issue) => (
        <Callout
          key={`${issue.kind}-${"from" in issue ? issue.from : ""}-${"month" in issue ? String(issue.month) : ""}`}
          severity="error"
          title={
            issue.kind === "invalid-tax-code"
              ? "That tax code isn't one we recognise"
              : issue.kind === "pension-exceeds-pay"
                ? "The pension is more than the pay it comes from"
                : "Deductions are more than the pay"
          }
        >
          {issue.message}
        </Callout>
      ))}
    </>
  );
}

function flagInsight(
  flag: TakeHomeFlag,
  result: TakeHomeCalculation,
): { key: string; severity: "info" | "warning"; title: string; body: React.ReactNode } {
  switch (flag.kind) {
    case "sixty-percent-band":
      return {
        key: flag.kind,
        severity: "warning",
        title: "You're in the 60% band",
        body: (
          <>
            Between £100,000 and £125,140, your tax-free allowance shrinks as you earn more, so this
            pay is taxed at an effective 60%. Another{" "}
            <span className="num">{gbp(flag.extraPensionToExit)}</span> a year into your pension
            would bring your adjusted net income down to £100,000.
          </>
        ),
      };
    case "annual-allowance-exceeded":
      return {
        key: flag.kind,
        severity: "warning",
        title: "Over the pension annual allowance",
        body: (
          <>
            <span className="num">{gbp(flag.pensionInput)}</span> goes into your pension this year,{" "}
            <span className="num">{gbp(flag.excess)}</span> over your{" "}
            {flag.tapered ? "tapered " : ""}allowance of{" "}
            <span className="num">{gbp(flag.allowance)}</span>. Unless you have unused allowance
            from the last three years to carry forward, the excess is taxed at your marginal rate
            through Self Assessment.
          </>
        ),
      };
    case "provisional-figures":
      return {
        key: flag.kind,
        severity: "info",
        title: `Some ${taxYearLabel(result.taxYear)} figures aren't confirmed yet`,
        body: (
          <ul className="plain-list">
            {flag.figures.map((f) => (
              <li key={f.label}>
                <strong>{f.label}.</strong> {f.note}
              </li>
            ))}
          </ul>
        ),
      };
    case "tax-code-region-mismatch":
      return {
        key: flag.kind,
        severity: "warning",
        title: "Your tax code doesn't match where you live",
        body: `The code is for ${flag.codeRegime === "scotland" ? "Scottish" : flag.codeRegime === "wales" ? "Welsh" : "English and Northern Irish"} rates, so the figures use those.`,
      };
    case "tax-not-deducted":
      return {
        key: flag.kind,
        severity: "info",
        title: "Some tax isn't taken through your pay",
        body: (
          <>
            Payroll can't take more than half your pay in tax, so{" "}
            <span className="num">{gbp(flag.amount)}</span> is left for HMRC to collect another way,
            such as through next year's tax code.
          </>
        ),
      };
  }
}

const calloutIcons = { info: Info, warning: AlertTriangle, error: OctagonAlert } as const;

export function Callout({
  severity,
  title,
  children,
}: {
  severity: "info" | "warning" | "error";
  title: string;
  children: React.ReactNode;
}) {
  const Icon = calloutIcons[severity];
  return (
    <aside className={`callout ${severity}`}>
      <Icon size={18} className="callout-icon" aria-hidden />
      <div>
        <h3>{title}</h3>
        <div className="callout-body">{children}</div>
      </div>
    </aside>
  );
}

export function Months({ result }: { result: TakeHomeCalculation }) {
  return (
    <section className="panel" aria-labelledby="months-heading">
      <h2 id="months-heading" className="kicker">
        Month by month
      </h2>
      <div className="table-scroll">
        <table className="months">
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col" className="wide-only">
                Gross
              </th>
              <th scope="col" className="wide-only">
                Pension
              </th>
              <th scope="col" className="wide-only">
                Tax
              </th>
              <th scope="col" className="wide-only">
                NI
              </th>
              <th scope="col" className="wide-only">
                Loans
              </th>
              <th scope="col" className="narrow-only">
                Deductions
              </th>
              <th scope="col">Take-home</th>
            </tr>
          </thead>
          <tbody>
            {result.months.map((m) => (
              <tr key={m.month} className={m.isBonusMonth ? "bonus-row" : undefined}>
                <th scope="row">
                  {taxMonthShort(m.month)}
                  {m.isBonusMonth && <span className="tag">bonus</span>}
                </th>
                <td className="num wide-only">{gbp(m.grossPay)}</td>
                <td className="num wide-only">{gbp(pensionFromPay(m))}</td>
                <td className="num wide-only">{gbp(m.incomeTax)}</td>
                <td className="num wide-only">{gbp(m.nationalInsurance)}</td>
                <td className="num wide-only">{gbp(m.studentLoanTotal)}</td>
                <td className="num narrow-only">{gbp(m.grossPay - m.netPay)}</td>
                <td className="num strong">{gbpExact(m.netPay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
