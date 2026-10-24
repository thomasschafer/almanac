import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import type { LoanMonth, LoanProjection } from "../../../shared/take-home/result.ts";
import { PageHeader } from "../../shell/PageHeader.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { NOW, useTakeHome } from "./context.tsx";
import { formatMonthYear, gbp, gbpExact, percent, taxYearLabel } from "./format.ts";
import {
  Assumptions,
  BalanceChart,
  LoanTotals,
  outcomeSentence,
  ProjectionProblem,
  totalsUntil,
} from "./LoanChart.tsx";
import { NotLoaded } from "./NotLoaded.tsx";
import { Callout } from "./Results.tsx";

interface YearRow {
  taxYear: string;
  months: LoanMonth[];
  repaid: number;
  interest: number;
  closing: number;
}

function byTaxYear(months: readonly LoanMonth[]): YearRow[] {
  const rows: YearRow[] = [];
  for (const month of months) {
    let row = rows.at(-1);
    if (row?.taxYear !== month.taxYear) {
      row = { taxYear: month.taxYear, months: [], repaid: 0, interest: 0, closing: 0 };
      rows.push(row);
    }
    row.months.push(month);
    row.repaid += month.repaid;
    row.interest += month.interest;
    row.closing = month.balance;
  }
  return rows;
}

const monthName = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });

/** The pay month a projection month covers, named by its calendar month: "Oct 2026". */
function payMonthLabel(month: LoanMonth): string {
  const end = new Date(`${month.date}T12:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() - 1);
  return monthName.format(end);
}

export function StudentLoansPage() {
  const { state, editing, setUi, nowCalculation, whatIfCalculation } = useTakeHome();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Student loans · Almanac";
    return () => {
      document.title = "Almanac";
    };
  }, []);

  const header = (
    <PageHeader title="Student loans" back={{ to: "/take-home", label: "Take-home pay" }} />
  );
  if (state === null || nowCalculation === null) {
    return (
      <main className="page">
        {header}
        <NotLoaded />
      </main>
    );
  }

  const whatIf = state.whatIf;
  const calculation =
    editing === "what-if" && whatIfCalculation !== null ? whatIfCalculation : nowCalculation;

  return (
    <main className="page loans-page">
      {header}
      {whatIf !== null && (
        <div className="loans-scenario">
          <Segmented
            label="Showing"
            value={editing}
            options={[
              { value: "now", label: NOW },
              { value: "what-if", label: whatIf.label },
            ]}
            onChange={(scenario) => {
              setUi({ editing: scenario });
            }}
          />
        </div>
      )}
      {calculation.kind === "no-rules" ? (
        <Callout severity="error" title={`No tax rules for ${taxYearLabel(calculation.taxYear)}`}>
          Choose another tax year on the take-home page.
        </Callout>
      ) : calculation.projection.status !== "ok" ? (
        <section className="panel">
          <ProjectionProblem projection={calculation.projection} />
        </section>
      ) : (
        (() => {
          const projection = calculation.projection;
          const charted = projection.loans.filter((l) => l.months.length > 0);
          if (projection.loans.length === 0) {
            return (
              <p className="empty">Add a student loan on the take-home page to see it here.</p>
            );
          }
          const selected = charted.find((l) => l.plan === selectedPlan) ?? charted[0] ?? null;
          return (
            <div className="loans-layout">
              <section className="panel" aria-labelledby="overview-heading">
                <h2 id="overview-heading" className="kicker">
                  Overview
                </h2>
                <div className="loan-sentences">
                  {projection.loans.map((loan) => (
                    <p key={loan.plan}>{outcomeSentence(loan)}</p>
                  ))}
                </div>
                {charted.length > 0 && (
                  <>
                    <BalanceChart start={projection.start} loans={charted} height={280} />
                    <LoanTotals projection={projection} />
                  </>
                )}
                <Assumptions assumptions={projection.assumptions} />
              </section>
              {selected !== null && (
                <LoanDetail
                  loan={selected}
                  plans={charted}
                  onSelect={(plan) => {
                    setSelectedPlan(plan);
                  }}
                />
              )}
            </div>
          );
        })()
      )}
    </main>
  );
}

function LoanDetail({
  loan,
  plans,
  onSelect,
}: {
  loan: LoanProjection;
  plans: readonly LoanProjection[];
  onSelect: (plan: string) => void;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const years = byTaxYear(loan.months);
  const until = totalsUntil([loan]);
  const first = loan.months[0];
  const repaymentsStart = loan.repaymentsStart;
  const months = loan.months.filter(
    (month) => repaymentsStart === null || month.date >= repaymentsStart,
  ).length;

  return (
    <section className="panel" aria-labelledby="detail-heading">
      <div className="panel-head">
        <h2 id="detail-heading" className="kicker">
          {loan.name}, year by year
        </h2>
        {plans.length > 1 && (
          <Segmented
            label="Loan"
            hideLabel
            value={loan.plan}
            options={plans.map((p) => ({ value: p.plan, label: p.name }))}
            onChange={onSelect}
          />
        )}
      </div>
      <dl className="detail-stats">
        {first !== undefined && (
          <div>
            <dt>Repayment this month</dt>
            <dd className="num">{gbp(first.repaid)}</dd>
          </div>
        )}
        {first !== undefined && (
          <div>
            <dt>Interest rate now</dt>
            <dd className="num">{percent(first.interestRatePercent, 2)}</dd>
          </div>
        )}
        <div>
          <dt>Months of repayments</dt>
          <dd className="num">
            {months}
            <span className="muted">
              {" "}
              ({Math.floor(months / 12)}y {months % 12}m)
            </span>
          </dd>
        </div>
        <div>
          <dt>Interest added{until}</dt>
          <dd className="num">{gbp(loan.totalInterest)}</dd>
        </div>
        <div>
          <dt>Repaid{until}</dt>
          <dd className="num">{gbp(loan.totalRepaid)}</dd>
        </div>
      </dl>
      <YearBars years={years} />
      <div className="table-scroll">
        <table className="loan-table">
          <thead>
            <tr>
              <th scope="col">Tax year</th>
              <th scope="col">Repaid</th>
              <th scope="col">Interest</th>
              <th scope="col">Balance after</th>
            </tr>
          </thead>
          <tbody>
            {years.map((year) => {
              const expanded = open.has(year.taxYear);
              return (
                <Fragment key={year.taxYear}>
                  <tr className="year-row">
                    <th scope="row">
                      <button
                        type="button"
                        className="row-toggle"
                        aria-expanded={expanded}
                        onClick={() => {
                          setOpen((current) => {
                            const next = new Set(current);
                            if (expanded) next.delete(year.taxYear);
                            else next.add(year.taxYear);
                            return next;
                          });
                        }}
                      >
                        {expanded ? (
                          <ChevronDown size={14} aria-hidden />
                        ) : (
                          <ChevronRight size={14} aria-hidden />
                        )}
                        {taxYearLabel(year.taxYear)}
                      </button>
                    </th>
                    <td className="num">{gbp(year.repaid)}</td>
                    <td className="num">{gbp(year.interest)}</td>
                    <td className="num strong">{gbp(year.closing)}</td>
                  </tr>
                  {expanded && (
                    <tr className="month-rows">
                      <td colSpan={4}>
                        <table className="loan-months">
                          <thead>
                            <tr>
                              <th scope="col">Month</th>
                              <th scope="col">Pay</th>
                              <th scope="col">Rate</th>
                              <th scope="col">Interest</th>
                              <th scope="col">Repaid</th>
                              <th scope="col">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {year.months.map((m) => (
                              <tr key={m.date}>
                                <th scope="row">{payMonthLabel(m)}</th>
                                <td className="num">{gbp(m.pay)}</td>
                                <td className="num">{percent(m.interestRatePercent, 2)}</td>
                                <td className="num">{gbpExact(m.interest)}</td>
                                <td className="num">{gbpExact(m.repaid)}</td>
                                <td className="num">{gbpExact(m.balance)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {loan.outcome.kind === "written-off" && (
        <p className="panel-note">
          The remaining <span className="num">{gbp(loan.outcome.balanceWrittenOff)}</span> is
          written off in {formatMonthYear(loan.outcome.date)}.
        </p>
      )}
    </section>
  );
}

const BAR_HEIGHT = 140;

/** Repaid and interest added in each tax year, side by side. */
function YearBars({ years }: { years: readonly YearRow[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(1, ...years.flatMap((y) => [y.repaid, y.interest]));
  const shown = years.find((y) => y.taxYear === hovered) ?? null;
  return (
    <div className="year-bars">
      <div className="chart-readout" aria-live="polite">
        {shown === null ? (
          <span className="muted">Each tax year: repaid and interest added</span>
        ) : (
          <>
            <span className="muted">{taxYearLabel(shown.taxYear)}</span>
            <span>
              <span className="swatch" style={{ background: "var(--series-1)" }} />
              Repaid <span className="num">{gbp(shown.repaid)}</span>
            </span>
            <span>
              <span className="swatch" style={{ background: "var(--series-2)" }} />
              Interest <span className="num">{gbp(shown.interest)}</span>
            </span>
          </>
        )}
      </div>
      <div
        className="bars"
        style={{ height: BAR_HEIGHT }}
        role="img"
        aria-label="Repaid and interest added each tax year"
        onPointerLeave={() => {
          setHovered(null);
        }}
      >
        {years.map((year) => (
          <div
            key={year.taxYear}
            className={`bar-group${hovered === year.taxYear ? " hovered" : ""}`}
            onPointerEnter={() => {
              setHovered(year.taxYear);
            }}
          >
            <span
              className="bar"
              style={{
                height: `${String((year.repaid / max) * 100)}%`,
                background: "var(--series-1)",
              }}
            />
            <span
              className="bar"
              style={{
                height: `${String((year.interest / max) * 100)}%`,
                background: "var(--series-2)",
              }}
            />
          </div>
        ))}
      </div>
      <div className="bars-axis">
        <span>{taxYearLabel(years[0]?.taxYear ?? "")}</span>
        <span>{taxYearLabel(years.at(-1)?.taxYear ?? "")}</span>
      </div>
      <div className="chart-legend">
        <span>
          <span className="swatch" style={{ background: "var(--series-1)" }} />
          Repaid
        </span>
        <span>
          <span className="swatch" style={{ background: "var(--series-2)" }} />
          Interest added
        </span>
      </div>
    </div>
  );
}
