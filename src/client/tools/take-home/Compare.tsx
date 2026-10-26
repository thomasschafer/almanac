import { ArrowRight } from "lucide-react";
import type { StudentLoanProjection } from "../../../shared/take-home/result.ts";
import type { Scenario } from "./context.tsx";
import { formatMonthYear, gbp, gbpChange } from "./format.ts";
import { pensionFromPay } from "./Results.tsx";

function loanEnd(projection: StudentLoanProjection): string | null {
  if (projection.status !== "ok" || projection.loans.length === 0) return null;
  return projection.loans
    .map((loan) => {
      switch (loan.outcome.kind) {
        case "already-repaid":
          return "Repaid";
        case "repaid":
          return `Repaid ${formatMonthYear(loan.outcome.date)}`;
        case "written-off":
          return `Written off ${formatMonthYear(loan.outcome.date)}`;
        case "outstanding":
          return "Not repaid";
        case "may-be-written-off-at-age":
          return loan.outcome.repaidBy !== null
            ? `Repaid ${formatMonthYear(loan.outcome.repaidBy)}, unless written off sooner`
            : loan.outcome.termWriteOff?.appliesTo === "every-loan"
              ? `Written off by ${formatMonthYear(loan.outcome.termWriteOff.date)}`
              : "Unknown";
        case "unknown":
          return loan.outcome.missing === "balance" || loan.outcome.repaidBy === null
            ? "Unknown"
            : `Repaid ${formatMonthYear(loan.outcome.repaidBy)}`;
      }
    })
    .join(", ");
}

/**
 * The total repaid over each loan's life, or null unless every loan ends within the projection:
 * otherwise the total only covers the projection's horizon, which isn't comparable.
 */
function loanRepaid(projection: StudentLoanProjection): number | null {
  if (projection.status !== "ok" || projection.loans.length === 0) return null;
  const allEnd = projection.loans.every((loan) =>
    ["already-repaid", "repaid", "written-off"].includes(loan.outcome.kind),
  );
  return allEnd ? projection.totalRepaid : null;
}

interface Row {
  label: string;
  get: (s: Scenario) => number;
}

/** The two scenarios' key figures side by side, with the difference. */
export function Compare({ now, whatIf }: { now: Scenario; whatIf: Scenario }) {
  const anyBonus = now.result.bonusMonth !== null || whatIf.result.bonusMonth !== null;
  const rows: Row[] = [
    {
      label: "A normal month",
      get: (s) => s.result.normalMonth.netPay,
    },
    ...(anyBonus
      ? [
          {
            label: "Bonus month",
            get: (s: Scenario) => s.result.bonusMonth?.netPay ?? s.result.normalMonth.netPay,
          },
        ]
      : []),
    { label: "Take-home, a year", get: (s) => s.result.annual.netPay },
    {
      label: "Into your pension",
      get: (s) => s.result.annual.pension.total,
    },
    {
      label: "From your pay into it",
      get: (s) => pensionFromPay(s.result.annual),
    },
    {
      label: "Tax and NI",
      get: (s) => s.result.annual.incomeTax + s.result.annual.nationalInsurance,
    },
    {
      label: "Student loans",
      get: (s) => s.result.annual.studentLoanTotal,
    },
  ];

  const monthly = whatIf.result.normalMonth.netPay - now.result.normalMonth.netPay;
  const pension = whatIf.result.annual.pension.total - now.result.annual.pension.total;
  const nowRepaid = loanRepaid(now.projection);
  const whatIfRepaid = loanRepaid(whatIf.projection);
  const nowEnd = loanEnd(now.projection);
  const whatIfEnd = loanEnd(whatIf.projection);

  return (
    <section className="panel compare" aria-labelledby="compare-heading">
      <h2 id="compare-heading" className="kicker">
        {now.name} <ArrowRight size={12} aria-label="compared with" className="inline-icon" />{" "}
        {whatIf.name}
      </h2>
      <p className="compare-headline">
        {monthly === 0 ? (
          "The same take-home each month"
        ) : (
          <>
            <span className="num">{gbpChange(monthly)}</span> a month
          </>
        )}
        {pension !== 0 && (
          <span className="compare-sub">
            {" "}
            and <span className="num">{gbpChange(pension)}</span> a year into your pension
          </span>
        )}
      </p>
      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Figure</span>
            </th>
            <th scope="col">
              <span className="compare-name">{now.name}</span>
            </th>
            <th scope="col">
              <span className="compare-name">{whatIf.name}</span>
            </th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const a = row.get(now);
            const b = row.get(whatIf);
            return (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td className="num">{gbp(a)}</td>
                <td className="num">{gbp(b)}</td>
                <td className="num strong">{gbpChange(b - a)}</td>
              </tr>
            );
          })}
          {nowRepaid !== null && whatIfRepaid !== null && (
            <tr>
              <th scope="row">Student loans repaid in total</th>
              <td className="num">{gbp(nowRepaid)}</td>
              <td className="num">{gbp(whatIfRepaid)}</td>
              <td className="num strong">{gbpChange(whatIfRepaid - nowRepaid)}</td>
            </tr>
          )}
          {nowEnd !== null && whatIfEnd !== null && nowEnd !== whatIfEnd && (
            <tr>
              <th scope="row">Student loans</th>
              <td>{nowEnd}</td>
              <td>{whatIfEnd}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
