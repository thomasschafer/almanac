import type { ReactNode } from "react";
import type {
  HouseMoveCalculation,
  HouseMoveWarning,
  MonthBreakdown,
  MoveDate,
} from "../../../shared/house-move/result.ts";
import { Callout } from "../../ui/Callout.tsx";
import { gbp, monthLabel } from "./format.ts";
import { MoveChart } from "./MoveChart.tsx";

export function headline(result: MoveDate): string {
  switch (result.kind) {
    case "now":
      return "Now";
    case "future":
      return monthLabel(result.month);
    case "not-within-40-years":
      return "Not within 40 years";
  }
}

export function waitLabel(result: MoveDate): string {
  if (result.kind === "now") return "The sale leaves enough for your chosen deposit today.";
  if (result.kind === "not-within-40-years")
    return "The available funds or borrowing limit do not cover this move in the next 40 years.";
  const parts = [
    result.years > 0 ? `${result.years} ${result.years === 1 ? "year" : "years"}` : "",
    result.months > 0 ? `${result.months} ${result.months === 1 ? "month" : "months"}` : "",
  ].filter(Boolean);
  return `In ${parts.join(" ")}`;
}

function Amount({ value, real }: { value: number; real?: number }) {
  return (
    <span className="move-amount">
      <span className="num">{gbp(value)}</span>
      {real !== undefined && real !== value && (
        <span className="move-real">
          <span className="num">{gbp(real)}</span> in today's money
        </span>
      )}
    </span>
  );
}

function Line({
  name,
  value,
  real,
  strong = false,
}: {
  name: string;
  value: number;
  real?: number;
  strong?: boolean;
}) {
  return (
    <div className={strong ? "move-line total" : "move-line"}>
      <dt>{name}</dt>
      <dd>
        <Amount value={value} {...(real === undefined ? {} : { real })} />
      </dd>
    </div>
  );
}

export function Breakdown({
  row,
  region,
  asOf,
  mortgage,
}: {
  mortgage: import("../../../shared/house-move/inputs.ts").HouseMoveInputs["mortgage"];
  asOf: string;
  row: MonthBreakdown;
  region: "england-ni" | "scotland";
}) {
  const real = row.todaysMoney;
  return (
    <>
      <section className="panel" aria-label="Move breakdown">
        <h2 className="kicker">Where the money goes · {monthLabel(row.month)}</h2>
        <p className="panel-note">Today's money is in {monthLabel(asOf)} pounds.</p>
        <h3 className="move-subhead">Selling your home</h3>
        <dl className="move-breakdown">
          <Line name="Sale price" value={row.salePrice} real={real.salePrice} />
          <Line name="Mortgage paid off" value={row.mortgageBalance} real={real.mortgageBalance} />
          {(row.earlyRepaymentCharge !== 0 || mortgage.ercBands.length > 0) && (
            <>
              <Line
                name="Early repayment charge"
                value={row.earlyRepaymentCharge}
                real={real.earlyRepaymentCharge}
              />
            </>
          )}
          {(row.exitFee !== 0 || mortgage.exitFee !== 0) && (
            <>
              <Line name="Exit fee" value={row.exitFee} real={real.exitFee} />
            </>
          )}
          {row.costs
            .filter((cost) => cost.timing === "completion")
            .map((cost) => (
              <Line
                key={cost.id}
                name={`${cost.name}${cost.vat > 0 ? " (including VAT)" : ""}`}
                value={cost.total}
              />
            ))}
          <Line
            name="Total costs at completion"
            value={row.completionCosts}
            real={real.completionCosts}
          />
          <Line
            name="Equity left after tax and completion costs"
            value={row.equityLeft}
            real={real.equityLeft}
            strong
          />
        </dl>
        <h3 className="move-subhead">Buying your next home</h3>
        <dl className="move-breakdown">
          <Line name="Target price" value={row.targetPrice} real={real.targetPrice} />
          <Line name="Deposit" value={row.deposit} real={real.deposit} />
          <Line
            name={`${region === "scotland" ? "LBTT" : "SDLT"} on buying`}
            value={row.buyingTax}
            real={real.buyingTax}
          />
          <Line name="New mortgage" value={row.newMortgage} real={real.newMortgage} />
          <Line name="Savings left after up-front costs" value={row.savingsLeft} />
          <Line
            name="Left over beyond the deposit"
            value={row.leftOver}
            real={real.leftOver}
            strong
          />
        </dl>
        {row.borrowing !== null && (
          <p className="panel-note">
            Borrowing limit: <span className="num">{gbp(row.borrowing.maximum)}</span> from yearly
            household income of <span className="num">{gbp(row.borrowing.income)}</span>.{" "}
            {row.borrowing.sufficient
              ? "The new mortgage fits this limit."
              : "The new mortgage exceeds this limit."}
          </p>
        )}
      </section>
      <section className="panel" aria-label="Cash before completion">
        <h2 className="kicker">Cash before completion</h2>
        <dl className="move-breakdown">
          {row.costs
            .filter((cost) => cost.timing === "upfront")
            .map((cost) => (
              <Line key={cost.id} name={cost.name} value={cost.total} />
            ))}
          <Line
            name="Cash needed up front"
            value={row.upfrontCosts}
            real={real.upfrontCosts}
            strong
          />
          <Line name="Savings available" value={row.savings} real={real.savings} />
        </dl>
        <p className="panel-note">
          {row.upfrontShortfall === 0 ? (
            "Savings cover the up-front costs."
          ) : (
            <>
              <span className="num">{gbp(row.upfrontShortfall)}</span> short in cash. This does not
              delay the move date; equity is only released at completion.
            </>
          )}
        </p>
      </section>
    </>
  );
}

function warningCopy(warning: HouseMoveWarning): {
  title: string;
  body: ReactNode;
  severity: "info" | "warning";
} {
  switch (warning.kind) {
    case "buying-tax-assumed-unchanged":
      return {
        title: "Buying tax uses today's rules",
        body: "SDLT, LBTT and VAT are assumed to stay the same. This assumes you sell and buy your main home on the same day.",
        severity: "info",
      };
    case "mortgage-unpaid-at-term":
      return {
        title: "Mortgage runs past its term",
        body: (
          <>
            <span className="num">{gbp(warning.balance)}</span> is still owed in{" "}
            {monthLabel(warning.month)}. Payments and interest continue after the contractual term.
          </>
        ),
        severity: "warning",
      };
    case "overpayment-allowance-exceeded":
      return {
        title: "Overpayments exceed the allowance",
        body: (
          <>
            {monthLabel(warning.from)} to {monthLabel(warning.until)}:{" "}
            <span className="num">{gbp(warning.overpayments)}</span> paid against an allowance of{" "}
            <span className="num">{gbp(warning.allowance)}</span>, exceeding it by{" "}
            <span className="num">{gbp(warning.excess)}</span>. Your lender may charge for this.
          </>
        ),
        severity: "warning",
      };
  }
}

export function Results({
  calculation,
  region,
  asOf,
  mortgage,
}: {
  mortgage: import("../../../shared/house-move/inputs.ts").HouseMoveInputs["mortgage"];
  asOf: string;
  calculation: HouseMoveCalculation;
  region: "england-ni" | "scotland";
}) {
  const row = calculation.breakdown;
  const last = calculation.series.at(-1);
  return (
    <>
      {row === null && last !== undefined && (
        <Callout severity="warning" title="This move is still out of reach">
          <p>
            By {monthLabel(last.month)},{" "}
            {last.leftOver < 0 ? (
              <>
                <span className="num">{gbp(0 - last.leftOver)}</span> more is needed for the
                deposit.
              </>
            ) : (
              "the deposit is covered."
            )}{" "}
            {last.borrowing !== null && !last.borrowing.sufficient && (
              <>
                The new mortgage is{" "}
                <span className="num">{gbp(last.newMortgage - last.borrowing.maximum)}</span> above
                the borrowing limit.{" "}
              </>
            )}
            Try a lower target, more saving or a different deposit.
          </p>
        </Callout>
      )}
      {row !== null && <Breakdown row={row} region={region} asOf={asOf} mortgage={mortgage} />}
      <MoveChart calculation={calculation} />
      {calculation.warnings.map((warning, index) => {
        const copy = warningCopy(warning);
        return (
          <Callout key={index} {...copy}>
            {copy.body}
          </Callout>
        );
      })}
    </>
  );
}
