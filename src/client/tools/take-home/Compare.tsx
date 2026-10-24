import { X } from "lucide-react";
import type {
  StudentLoanProjection,
  TakeHomeCalculation,
} from "../../../shared/take-home/result.ts";
import { formatMonthYear, gbp, gbpChange } from "./format.ts";

export interface Scenario {
  name: string;
  result: TakeHomeCalculation;
  projection: StudentLoanProjection;
}

function loanEnd(projection: StudentLoanProjection): string {
  if (projection.status !== "ok" || projection.loans.length === 0) return "—";
  const ends = projection.loans.map((loan) => {
    switch (loan.outcome.kind) {
      case "repaid":
        return `Repaid ${formatMonthYear(loan.outcome.date)}`;
      case "written-off":
        return `Written off ${formatMonthYear(loan.outcome.date)}`;
      case "outstanding":
        return "Not repaid";
      case "unknown":
        return loan.outcome.missing === "balance" || loan.outcome.repaidBy === null
          ? "—"
          : `Repaid ${formatMonthYear(loan.outcome.repaidBy)}`;
    }
  });
  return ends.join(", ");
}

/** The current figures side by side with a preset's. */
export function Compare({
  current,
  other,
  onClose,
}: {
  current: Scenario;
  other: Scenario;
  onClose: () => void;
}) {
  const anyBonus = current.result.bonusMonth !== null || other.result.bonusMonth !== null;
  const rows: { label: string; get: (s: Scenario) => number }[] = [
    { label: "Take-home, a normal month", get: (s) => s.result.normalMonth.netPay },
    ...(anyBonus
      ? [
          {
            label: "Take-home, bonus month",
            get: (s: Scenario) => s.result.bonusMonth?.netPay ?? s.result.normalMonth.netPay,
          },
        ]
      : []),
    { label: "Take-home, a year", get: (s) => s.result.annual.netPay },
    { label: "Into your pension, a year", get: (s) => s.result.annual.pension.total },
    {
      label: "Tax and NI, a year",
      get: (s) => s.result.annual.incomeTax + s.result.annual.nationalInsurance,
    },
    { label: "Student loans, a year", get: (s) => s.result.annual.studentLoanTotal },
  ];
  return (
    <section className="panel compare" aria-labelledby="compare-heading">
      <div className="panel-head">
        <h2 id="compare-heading" className="kicker">
          Compared with {other.name}
        </h2>
        <button
          type="button"
          className="icon-button small"
          aria-label="Stop comparing"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Figure</span>
            </th>
            <th scope="col">{current.name}</th>
            <th scope="col">{other.name}</th>
            <th scope="col">Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const a = row.get(current);
            const b = row.get(other);
            return (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td className="num">{gbp(a)}</td>
                <td className="num">{gbp(b)}</td>
                <td className="num strong">{gbpChange(a - b)}</td>
              </tr>
            );
          })}
          <tr>
            <th scope="row">Student loans</th>
            <td>{loanEnd(current.projection)}</td>
            <td>{loanEnd(other.projection)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </section>
  );
}
