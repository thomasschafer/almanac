import { useCallback, useState } from "react";
import type {
  LoanOutcome,
  LoanProjection,
  StudentLoanProjection,
} from "../../../shared/take-home/result.ts";
import { formatDay, formatMonthYear, gbp, taxYearLabel } from "./format.ts";

const seriesColors = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

function seriesColor(index: number): string {
  const color = seriesColors[index];
  if (color === undefined) throw new Error("more student loans than chart colours");
  return color;
}

function time(date: string): number {
  return new Date(`${date}T12:00:00Z`).getTime();
}

function outcomeSentence(loan: LoanProjection): React.ReactNode {
  const outcome: LoanOutcome = loan.outcome;
  switch (outcome.kind) {
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

const HEIGHT = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 48 };

export function LoanChart({ projection }: { projection: StudentLoanProjection }) {
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

  if (projection.status === "no-rules") {
    return (
      <LoanPanel>
        <p className="empty">
          There are no tax rules for {taxYearLabel(projection.taxYear)} yet, so the student loan
          can't be projected.
        </p>
      </LoanPanel>
    );
  }
  if (projection.status === "invalid") {
    return (
      <LoanPanel>
        {projection.issues.map((issue) => (
          <p key={issue.kind} className="empty">
            {issue.message}
          </p>
        ))}
      </LoanPanel>
    );
  }

  const charted = projection.loans.filter((l) => l.points.length > 0);
  const allPoints = charted.flatMap((l) => l.points);
  const start = time(projection.start);
  const end = Math.max(start + 1, ...allPoints.map((p) => time(p.date)));
  const maxBalance = Math.max(1, ...allPoints.map((p) => p.balance));
  const yTop = niceCeiling(maxBalance);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - start) / (end - start)) * plotW;
  const y = (v: number) => PAD.top + (1 - v / yTop) * plotH;
  const startYear = new Date(start).getUTCFullYear();
  const endYear = new Date(end).getUTCFullYear();
  const yearStep = Math.max(
    1,
    Math.ceil((endYear - startYear) / Math.max(1, Math.floor(plotW / 70))),
  );
  const yearTicks: number[] = [];
  for (let year = startYear + 1; year <= endYear; year += yearStep) yearTicks.push(year);

  const scrubTime = scrub === null ? null : start + scrub * (end - start);
  const readout =
    scrubTime === null
      ? null
      : charted.map((loan) => {
          const before = loan.points.filter((p) => time(p.date) <= scrubTime).at(-1);
          const last = loan.points.at(-1);
          const balance =
            before === undefined
              ? 0
              : last !== undefined && time(last.date) < scrubTime
                ? 0
                : before.balance;
          return { loan, balance, date: before?.date ?? projection.start };
        });

  return (
    <LoanPanel>
      <div className="loan-sentences">
        {projection.loans.map((loan) => (
          <p key={loan.plan}>{outcomeSentence(loan)}</p>
        ))}
      </div>
      {charted.length > 0 && (
        <>
          <div className="chart-readout" aria-live="polite">
            {readout === null ? (
              <span className="muted">Drag across the chart to see the balance</span>
            ) : (
              <>
                <span className="muted">{formatDay(readout[0]?.date ?? projection.start)}</span>
                {readout.map((r, index) => (
                  <span key={r.loan.plan}>
                    {charted.length > 1 && (
                      <span className="swatch" style={{ background: seriesColor(index) }} />
                    )}
                    {charted.length > 1 ? `${r.loan.name} ` : ""}
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
              <svg
                width={width}
                height={HEIGHT}
                role="img"
                aria-label="Student loan balance over time"
              >
                {[0, 0.5, 1].map((f) => (
                  <g key={f}>
                    <line
                      className="grid-line"
                      x1={PAD.left}
                      x2={width - PAD.right}
                      y1={y(yTop * f)}
                      y2={y(yTop * f)}
                    />
                    <text
                      className="axis-label"
                      x={PAD.left - 8}
                      y={y(yTop * f) + 4}
                      textAnchor="end"
                    >
                      {compactPounds(yTop * f)}
                    </text>
                  </g>
                ))}
                {yearTicks.map((year) => {
                  const t = Date.UTC(year, 0, 1);
                  return (
                    <text
                      key={year}
                      className="axis-label"
                      x={x(t)}
                      y={HEIGHT - 6}
                      textAnchor="middle"
                    >
                      {year}
                    </text>
                  );
                })}
                {charted.map((loan, index) => {
                  const points = loan.points.map(
                    (p) => `${String(x(time(p.date)))},${String(y(p.balance))}`,
                  );
                  const first = loan.points[0];
                  const last = loan.points.at(-1);
                  if (first === undefined || last === undefined) return null;
                  const color = seriesColor(index);
                  return (
                    <g key={loan.plan}>
                      {charted.length === 1 && (
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
          {charted.length > 1 && (
            <div className="chart-legend">
              {charted.map((loan, index) => (
                <span key={loan.plan}>
                  <span className="swatch" style={{ background: seriesColor(index) }} />
                  {loan.name}
                </span>
              ))}
            </div>
          )}
          <dl className="loan-totals">
            <div>
              <dt>Total repaid</dt>
              <dd className="num">{gbp(projection.totalRepaid)}</dd>
            </div>
            <div>
              <dt>Interest added</dt>
              <dd className="num">{gbp(projection.totalInterest)}</dd>
            </div>
          </dl>
        </>
      )}
      <details className="assumptions">
        <summary>Assumptions</summary>
        <ul className="plain-list">
          {projection.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </LoanPanel>
  );
}

function EndMarker({
  loan,
  cx,
  cy,
  color,
}: {
  loan: LoanProjection;
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
  if (loan.outcome.kind === "repaid" || (loan.outcome.kind === "unknown" && cy > 0)) {
    return <circle className="end-dot" cx={cx} cy={cy} r={5} style={{ fill: color }} />;
  }
  return null;
}

function LoanPanel({ children }: { children: React.ReactNode }) {
  return (
    <section className="panel loan-panel" aria-labelledby="loan-heading">
      <h2 id="loan-heading" className="kicker">
        Student loans
      </h2>
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
