import { ChevronRight } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "react-router";
import type { StudentLoanPlan } from "../../../shared/take-home/inputs.ts";
import type {
  LoanOutcome,
  LoanProjection,
  StudentLoanProjection,
} from "../../../shared/take-home/result.ts";
import {
  studentLoanPlanRules,
  type OlderLoanTerms,
} from "../../../shared/take-home/rules/student-loans.ts";
import { formatDay, formatLongDay, formatMonthYear, gbp, taxYearLabel } from "./format.ts";

/** Each plan keeps its colour wherever it's charted, whichever other loans are shown with it. */
const planColors: Readonly<Record<StudentLoanPlan, string>> = {
  plan1: "var(--series-1)",
  plan2: "var(--series-2)",
  plan4: "var(--series-3)",
  plan5: "var(--series-4)",
  postgraduate: "var(--series-5)",
};

function time(date: string): number {
  return new Date(`${date}T12:00:00Z`).getTime();
}

export function outcomeSentence(loan: LoanProjection): React.ReactNode {
  return (
    <>
      {outcomeOnly(loan)}
      {loan.repaymentsStart !== null && (
        <>
          {" "}
          Repayments start in <strong>{formatMonthYear(loan.repaymentsStart)}</strong>.
        </>
      )}
    </>
  );
}

function outcomeOnly(loan: LoanProjection): React.ReactNode {
  const outcome: LoanOutcome = loan.outcome;
  switch (outcome.kind) {
    case "already-repaid":
      return (
        <>
          <strong>{loan.name}</strong> is already repaid. Remove it from your student loans if it's
          still taken from your pay.
        </>
      );
    case "repaid":
      return (
        <>
          <strong>{loan.name}</strong> is repaid by <strong>{formatMonthYear(outcome.date)}</strong>
          , after <span className="num">{gbp(loan.totalRepaid)}</span> of repayments.
        </>
      );
    case "written-off":
      return (
        <>
          <strong>{loan.name}</strong> is written off in{" "}
          <strong>{formatMonthYear(outcome.date)}</strong> with{" "}
          <span className="num">{gbp(outcome.balanceWrittenOff)}</span> still owed, after{" "}
          <span className="num">{gbp(loan.totalRepaid)}</span> of repayments.
        </>
      );
    case "outstanding":
      return (
        <>
          <strong>{loan.name}</strong> still has <span className="num">{gbp(outcome.balance)}</span>{" "}
          to repay in {formatMonthYear(outcome.horizonEnd)}.
        </>
      );
    case "may-be-written-off-at-age":
      return <OlderLoanSentence loan={loan} outcome={outcome} />;
    case "unknown":
      return outcome.missing === "balance" ? (
        <>
          Add your <strong>{loan.name}</strong> balance to see when it's repaid.
        </>
      ) : outcome.repaidBy === null ? (
        <>
          <strong>{loan.name}</strong> isn't repaid within the projection. Add the year repayments
          started, under more options, to see when it's written off.
        </>
      ) : (
        <>
          <strong>{loan.name}</strong> would be repaid by{" "}
          <strong>{formatMonthYear(outcome.repaidBy)}</strong>, after{" "}
          <span className="num">{gbp(loan.totalRepaid)}</span>, unless it's written off first. Add
          the year repayments started, under more options, to check.
        </>
      );
  }
}

/** How older loans on a plan are written off: "when you're 65", and so on. */
export function olderLoanWriteOff(plan: StudentLoanPlan, terms: OlderLoanTerms): string {
  const { writeOff } = terms;
  switch (writeOff.kind) {
    case "at-age":
      return `when you're ${String(writeOff.age)}`;
    case "at-age-or-term":
      return `when you're ${String(writeOff.age)} or ${String(studentLoanPlanRules[plan].writeOffYears.value)} years after the April you were first due to repay, whichever comes first`;
  }
}

function OlderLoanSentence({
  loan,
  outcome,
}: {
  loan: LoanProjection;
  outcome: Extract<LoanOutcome, { kind: "may-be-written-off-at-age" }>;
}) {
  const { terms, firstPaid, repaidBy, termWriteOff } = outcome;
  const cutoff = formatLongDay(terms.firstPaidBefore);
  const writeOff = olderLoanWriteOff(loan.plan, terms);
  const usualTermMatters = terms.writeOff.kind === "at-age-or-term" || firstPaid === "not-sure";
  return (
    <>
      {repaidBy !== null ? (
        <>
          <strong>{loan.name}</strong> is repaid by <strong>{formatMonthYear(repaidBy)}</strong>,
          after <span className="num">{gbp(loan.totalRepaid)}</span> of repayments, unless it's
          written off sooner.
        </>
      ) : termWriteOff?.appliesTo === "every-loan" ? (
        <>
          <strong>{loan.name}</strong> is written off by{" "}
          <strong>{formatMonthYear(termWriteOff.date)}</strong> at the latest, after{" "}
          <span className="num">{gbp(loan.totalRepaid)}</span> of repayments.
        </>
      ) : (
        <>
          <strong>{loan.name}</strong> isn't repaid within the projection.
        </>
      )}{" "}
      {firstPaid === "before-cutoff" ? (
        <>
          As it was first paid before {cutoff}, it's written off {writeOff}.
        </>
      ) : (
        <>
          If it was first paid before {cutoff}, it's written off {writeOff}
          {termWriteOff?.appliesTo === "newer-loans" && (
            <>
              ; if not, in <strong>{formatMonthYear(termWriteOff.date)}</strong>
            </>
          )}
          . Say when it was first paid under more options.
        </>
      )}
      {!outcome.firstRepaymentYearKnown && usualTermMatters && (
        <> Add the year repayments started, under more options, to see when its term ends.</>
      )}
    </>
  );
}

const PAD = { top: 12, right: 12, bottom: 24, left: 48 };

/** Each loan's balance over time, with a readout that follows a drag or the pointer. */
export function BalanceChart({
  start,
  loans,
  height = 200,
}: {
  /** YYYY-MM-DD, where the chart starts. */
  start: string;
  /** Loans with points to chart. */
  loans: readonly LoanProjection[];
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const ref = useCallback((element: HTMLDivElement | null) => {
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const allPoints = loans.flatMap((l) => l.points);
  const startTime = time(start);
  const end = Math.max(startTime + 1, ...allPoints.map((p) => time(p.date)));
  const maxBalance = Math.max(1, ...allPoints.map((p) => p.balance));
  const yTop = niceCeiling(maxBalance);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - startTime) / (end - startTime)) * plotW;
  const y = (v: number) => PAD.top + (1 - v / yTop) * plotH;
  const startYear = new Date(startTime).getUTCFullYear();
  const endYear = new Date(end).getUTCFullYear();
  const yearStep = Math.max(
    1,
    Math.ceil((endYear - startYear) / Math.max(1, Math.floor(plotW / 70))),
  );
  const yearTicks: number[] = [];
  for (let year = startYear + 1; year <= endYear; year += yearStep) yearTicks.push(year);

  const scrubTime = scrub === null ? null : startTime + scrub * (end - startTime);
  const readout =
    scrubTime === null
      ? null
      : loans.map((loan) => {
          const before = loan.points.filter((p) => time(p.date) <= scrubTime).at(-1);
          const last = loan.points.at(-1);
          const balance =
            before === undefined
              ? 0
              : last !== undefined && time(last.date) < scrubTime
                ? 0
                : before.balance;
          return { loan, balance, date: before?.date ?? start };
        });

  return (
    <>
      <div className="chart-readout" aria-live="polite">
        {readout === null ? (
          <span className="muted">Drag across the chart to see the balance</span>
        ) : (
          <>
            <span className="muted">{formatDay(readout[0]?.date ?? start)}</span>
            {readout.map((r) => (
              <span key={r.loan.plan}>
                {loans.length > 1 && (
                  <span className="swatch" style={{ background: planColors[r.loan.plan] }} />
                )}
                {loans.length > 1 ? `${r.loan.name} ` : ""}
                <span className="num">{gbp(r.balance)}</span>
              </span>
            ))}
          </>
        )}
      </div>
      <div
        ref={ref}
        className="chart"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const fraction = (e.clientX - rect.left - PAD.left) / plotW;
          setScrub(Math.min(1, Math.max(0, fraction)));
        }}
        onPointerLeave={() => {
          setScrub(null);
        }}
      >
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label="Student loan balance over time">
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line
                  className="grid-line"
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(yTop * f)}
                  y2={y(yTop * f)}
                />
                <text className="axis-label" x={PAD.left - 8} y={y(yTop * f) + 4} textAnchor="end">
                  {compactPounds(yTop * f)}
                </text>
              </g>
            ))}
            {yearTicks.map((year) => {
              const t = Date.UTC(year, 0, 1);
              return (
                <text key={year} className="axis-label" x={x(t)} y={height - 6} textAnchor="middle">
                  {year}
                </text>
              );
            })}
            {loans.map((loan) => {
              const points = loan.points.map(
                (p) => `${String(x(time(p.date)))},${String(y(p.balance))}`,
              );
              const first = loan.points[0];
              const last = loan.points.at(-1);
              if (first === undefined || last === undefined) return null;
              const color = planColors[loan.plan];
              return (
                <g key={loan.plan}>
                  {loans.length === 1 && (
                    <polygon
                      className="chart-area"
                      style={{ fill: color }}
                      points={`${String(x(time(first.date)))},${String(y(0))} ${points.join(" ")} ${String(x(time(last.date)))},${String(y(0))}`}
                    />
                  )}
                  <polyline
                    className="chart-line"
                    style={{ stroke: color }}
                    points={points.join(" ")}
                  />
                  <EndMarker
                    loan={loan}
                    lastBalance={last.balance}
                    cx={x(time(last.date))}
                    cy={y(last.balance)}
                    color={color}
                  />
                </g>
              );
            })}
            {scrubTime !== null && (
              <line
                className="crosshair"
                x1={x(scrubTime)}
                x2={x(scrubTime)}
                y1={PAD.top}
                y2={PAD.top + plotH}
              />
            )}
          </svg>
        )}
      </div>
      {loans.length > 1 && (
        <div className="chart-legend">
          {loans.map((loan) => (
            <span key={loan.plan}>
              <span className="swatch" style={{ background: planColors[loan.plan] }} />
              {loan.name}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

export function ProjectionProblem({ projection }: { projection: StudentLoanProjection }) {
  if (projection.status === "no-rules") {
    return (
      <p className="empty">
        There are no tax rules for {taxYearLabel(projection.taxYear)} yet, so the student loan can't
        be projected.
      </p>
    );
  }
  if (projection.status === "invalid") {
    return (
      <>
        {projection.issues.map((issue) => (
          <p key={issue.kind} className="empty">
            {issue.message}
          </p>
        ))}
      </>
    );
  }
  return null;
}

export function LoanChart({
  projection,
  detailsLink = false,
}: {
  projection: StudentLoanProjection;
  /** Whether to link to the detailed breakdown. */
  detailsLink?: boolean;
}) {
  if (projection.status !== "ok") {
    return (
      <LoanPanel>
        <ProjectionProblem projection={projection} />
      </LoanPanel>
    );
  }
  const charted = projection.loans.filter((l) => l.points.length > 0);
  return (
    <LoanPanel
      action={
        detailsLink && charted.length > 0 ? (
          <Link to="student-loans" className="text-button panel-link">
            Breakdown <ChevronRight size={14} aria-hidden />
          </Link>
        ) : undefined
      }
    >
      <div className="loan-sentences">
        {projection.loans.map((loan) => (
          <p key={loan.plan}>{outcomeSentence(loan)}</p>
        ))}
      </div>
      {charted.length > 0 && (
        <>
          <BalanceChart start={projection.start} loans={charted} />
          <LoanTotals projection={projection} />
        </>
      )}
      <Assumptions assumptions={projection.assumptions} />
    </LoanPanel>
  );
}

/**
 * What totals across the loans cover, to follow "Repaid" or "Interest added": " to 5 Apr 2086"
 * when a loan's end isn't known within the projection, so they only cover the projection, and
 * ", unless written off sooner" when a loan may be written off at an age the projection can't
 * date. "" when they cover each loan's whole life.
 */
export function totalsQualifier(loans: readonly LoanProjection[]): string {
  const open = loans.some(
    ({ outcome }) =>
      outcome.kind === "outstanding" ||
      (outcome.kind === "unknown" && outcome.missing === "first-repayment-year") ||
      (outcome.kind === "may-be-written-off-at-age" &&
        outcome.repaidBy === null &&
        outcome.termWriteOff?.appliesTo !== "every-loan"),
  );
  const conditional = loans.some(({ outcome }) => outcome.kind === "may-be-written-off-at-age");
  const lastMonth = loans
    .flatMap((loan) => loan.months.map((month) => month.date))
    .sort()
    .at(-1);
  const until = open && lastMonth !== undefined ? ` to ${formatDay(lastMonth)}` : "";
  return `${until}${conditional ? ", unless written off sooner" : ""}`;
}

/**
 * What's repaid and added in interest across the loans. When a loan's end isn't known within the
 * projection, the totals only cover the projection, so they say when that ends.
 */
export function LoanTotals({
  projection,
}: {
  projection: Extract<StudentLoanProjection, { status: "ok" }>;
}) {
  const until = totalsQualifier(projection.loans);
  return (
    <dl className="loan-totals">
      <div>
        <dt>{until === "" ? "Total repaid" : `Repaid${until}`}</dt>
        <dd className="num">{gbp(projection.totalRepaid)}</dd>
      </div>
      <div>
        <dt>Interest added{until}</dt>
        <dd className="num">{gbp(projection.totalInterest)}</dd>
      </div>
    </dl>
  );
}

export function Assumptions({ assumptions }: { assumptions: readonly string[] }) {
  return (
    <details className="assumptions">
      <summary>Assumptions</summary>
      <ul className="plain-list">
        {assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </details>
  );
}

/** A cross where a loan is written off, and a dot where its balance reaches 0. */
function EndMarker({
  loan,
  lastBalance,
  cx,
  cy,
  color,
}: {
  loan: LoanProjection;
  lastBalance: number;
  cx: number;
  cy: number;
  color: string;
}) {
  if (loan.outcome.kind === "written-off") {
    return (
      <g className="end-marker" style={{ stroke: color }}>
        <line x1={cx - 5} x2={cx + 5} y1={cy - 5} y2={cy + 5} />
        <line x1={cx - 5} x2={cx + 5} y1={cy + 5} y2={cy - 5} />
      </g>
    );
  }
  if (lastBalance === 0) {
    return <circle className="end-dot" cx={cx} cy={cy} r={5} style={{ fill: color }} />;
  }
  return null;
}

function LoanPanel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="panel loan-panel" aria-labelledby="loan-heading">
      <div className="panel-head">
        <h2 id="loan-heading" className="kicker">
          Student loans
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The smallest round number at or above `value`, for the top of an axis. */
function niceCeiling(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

function compactPounds(pence: number): string {
  const pounds = pence / 100;
  if (pounds === 0) return "£0";
  if (pounds >= 1000) return `£${String(Math.round(pounds / 100) / 10)}k`;
  return `£${String(Math.round(pounds))}`;
}
