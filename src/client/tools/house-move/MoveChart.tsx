import type { HouseMoveCalculation } from "../../../shared/house-move/result.ts";
import { compactPounds, niceCeiling, useChartInteraction } from "../../ui/chart.ts";
import { gbp, monthLabel } from "./format.ts";

const PAD = { left: 58, right: 12, top: 18, bottom: 28 };

export function MoveChart({ calculation }: { calculation: HouseMoveCalculation }) {
  const { width, scrub, setScrub, ref } = useChartInteraction();
  const points = calculation.series;
  const height = 240;
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const values = points.flatMap((point) => [point.available, point.needed]);
  const top = niceCeiling(Math.max(1, ...values));
  const bottom = Math.min(0, ...values);
  const x = (index: number) => PAD.left + (index / Math.max(1, points.length - 1)) * plotW;
  const y = (value: number) =>
    PAD.top + ((top - value) / (top - bottom)) * (height - PAD.top - PAD.bottom);
  const selected = scrub === null ? null : Math.round(scrub * (points.length - 1));
  const readout = selected === null ? null : (points[selected] ?? null);
  const resultMonth =
    calculation.result.kind === "not-within-40-years" ? null : calculation.result.month;
  const marker = points.findIndex((p) => p.month === resultMonth);
  return (
    <section className="panel" aria-label="Move affordability chart">
      <h2 className="kicker">Available against needed</h2>
      <p className="panel-note">
        After mortgage, buying tax and costs. Up-front cash shortfalls are shown separately.
      </p>
      <div className="chart-readout" aria-live="polite">
        {readout === null ? (
          <span className="muted">Drag across the chart to explore each month</span>
        ) : (
          <>
            <span>{monthLabel(readout.month)}</span>
            <span>
              Available <span className="num">{gbp(readout.available)}</span>
            </span>
            <span>
              Needed <span className="num">{gbp(readout.needed)}</span>
            </span>
          </>
        )}
      </div>
      <div
        ref={ref}
        className="chart"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setScrub(
            Math.min(
              1,
              Math.max(
                0,
                (e.clientX - e.currentTarget.getBoundingClientRect().left - PAD.left) / plotW,
              ),
            ),
          );
        }}
        onPointerMove={(e) => {
          setScrub(
            Math.min(
              1,
              Math.max(
                0,
                (e.clientX - e.currentTarget.getBoundingClientRect().left - PAD.left) / plotW,
              ),
            ),
          );
        }}
        onPointerLeave={() => {
          setScrub(null);
        }}
      >
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="Money available and deposit needed over time"
          >
            {[0, 0.5, 1].map((fraction) => {
              const value = bottom + fraction * (top - bottom);
              return (
                <g key={fraction}>
                  <line
                    className="grid-line"
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={y(value)}
                    y2={y(value)}
                  />
                  <text className="axis-label" x={PAD.left - 8} y={y(value) + 4} textAnchor="end">
                    {compactPounds(value)}
                  </text>
                </g>
              );
            })}
            {(["available", "needed"] as const).map((key) => (
              <polyline
                key={key}
                className="chart-line"
                style={{ stroke: key === "available" ? "var(--house-move)" : "var(--series-2)" }}
                points={points.map((point, index) => `${x(index)},${y(point[key])}`).join(" ")}
              />
            ))}
            {marker >= 0 && (
              <g>
                <line
                  className="crosshair"
                  x1={x(marker)}
                  x2={x(marker)}
                  y1={PAD.top}
                  y2={height - PAD.bottom}
                />
                <text
                  className="axis-label"
                  x={Math.min(width - 40, Math.max(PAD.left + 24, x(marker)))}
                  y={12}
                  textAnchor="middle"
                >
                  Move
                </text>
              </g>
            )}
            {selected !== null && (
              <line
                className="crosshair"
                x1={x(selected)}
                x2={x(selected)}
                y1={PAD.top}
                y2={height - PAD.bottom}
              />
            )}
            {[0, Math.floor((points.length - 1) / 2), points.length - 1].map((index) => (
              <text
                key={index}
                className="axis-label"
                x={x(index)}
                y={height - 6}
                textAnchor="middle"
              >
                {points[index]?.month.slice(0, 4)}
              </text>
            ))}
          </svg>
        )}
      </div>
      <input
        className="move-chart-slider"
        type="range"
        min={0}
        max={points.length - 1}
        value={selected ?? 0}
        aria-label="Chart month"
        aria-valuetext={
          readout === null
            ? "Choose a month"
            : `${monthLabel(readout.month)}: available ${gbp(readout.available)}, needed ${gbp(readout.needed)}`
        }
        onChange={(e) => {
          setScrub(Number(e.target.value) / Math.max(1, points.length - 1));
        }}
      />
      <div className="chart-legend">
        <span>
          <span className="swatch" style={{ background: "var(--house-move)" }} />
          Available
        </span>
        <span>
          <span className="swatch" style={{ background: "var(--series-2)" }} />
          Needed
        </span>
      </div>
    </section>
  );
}
