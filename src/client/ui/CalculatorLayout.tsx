import type { HTMLAttributes, ReactNode } from "react";

/** Hero first on phones; sticky inputs beside the hero and results on laptops. */
export function CalculatorLayout({
  hero,
  inputs,
  results,
  stale,
  busy,
  inputEvents,
}: {
  hero: ReactNode;
  inputs: ReactNode;
  results: ReactNode;
  stale: boolean;
  busy?: boolean;
  inputEvents?: Pick<HTMLAttributes<HTMLDivElement>, "onFocus" | "onBlur">;
}) {
  return (
    <div className="calc-layout">
      <div className="calc-hero">{hero}</div>
      <div className="calc-inputs" {...inputEvents}>
        {inputs}
      </div>
      <div className={`calc-results stale-dims${stale ? " stale" : ""}`} aria-busy={busy}>
        {results}
      </div>
    </div>
  );
}
