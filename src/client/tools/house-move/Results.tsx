import type { HouseMoveInputs } from "../../../shared/house-move/inputs.ts";
import type { ReactNode } from "react";
import type {
  HouseMoveCalculation,
  HouseMoveWarning,
  MonthBreakdown,
  MoveDate,
} from "../../../shared/house-move/result.ts";
import { Callout } from "../../ui/Callout.tsx";
import { displayLedger } from "./display-ledger.ts";
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

type Operation = "+" | "−" | "=";

function Amount({
  value,
  real,
  operation,
}: {
  value: number;
  real?: number;
  operation?: Operation;
}) {
  const format = (amount: number) => {
    const formatted =
      operation === undefined ? gbp(amount) : `${amount < 0 ? "−" : ""}${gbp(Math.abs(amount))}`;
    if (operation === "−" && amount >= 0) return `−${formatted}`;
    if (operation === "+" && amount >= 0) return `+${formatted}`;
    return formatted;
  };
  return (
    <span className="move-amount">
      <span className="num move-nominal">{format(value)}</span>
      {real !== undefined && real !== value && (
        <span className="move-real">
          <span className="num">{format(real)}</span> in today's money
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
  operation,
  shortfall = false,
}: {
  name: string;
  value: number;
  real?: number;
  strong?: boolean;
  operation?: Operation;
  shortfall?: boolean;
}) {
  return (
    <div className={`move-line${strong ? " total" : ""}${shortfall ? " move-shortfall" : ""}`}>
      <dt>
        {operation === undefined ? (
          name
        ) : (
          <>
            <span className="move-sign">{operation}</span>
            <span>
              {name}
              {shortfall && <span className="move-shortfall-note">Shortfall</span>}
            </span>
          </>
        )}
      </dt>
      <dd>
        <Amount
          value={value}
          {...(real === undefined ? {} : { real })}
          {...(operation === undefined ? {} : { operation })}
        />
      </dd>
    </div>
  );
}

export function Breakdown({
  row,
  region,
  asOf,
  mortgage,
  deposit,
}: {
  mortgage: HouseMoveInputs["mortgage"];
  deposit: HouseMoveInputs["deposit"];
  asOf: string;
  row: MonthBreakdown;
  region: "england-ni" | "scotland";
}) {
  const real = row.todaysMoney;
  const ledger = displayLedger(row);
  return (
    <>
      <section className="panel" aria-label="Move breakdown">
        <h2 className="kicker">Where the money goes · {monthLabel(row.month)}</h2>
        <p className="panel-note">Today's money is in {monthLabel(asOf)} pounds.</p>
        <dl className="move-breakdown move-running">
          {ledger.move
            .filter((entry) => {
              if (entry.field === "earlyRepaymentCharge")
                return row.earlyRepaymentCharge !== 0 || mortgage.ercBands.length > 0;
              if (entry.field === "exitFee") return row.exitFee !== 0 || mortgage.exitFee !== 0;
              return true;
            })
            .map((entry) => (
              <Line
                key={entry.field}
                operation={entry.operation}
                name={
                  entry.field === "buyingTax"
                    ? region === "scotland"
                      ? "LBTT"
                      : "SDLT"
                    : entry.field === "deposit"
                      ? `Deposit (${deposit.kind === "percent" ? `${deposit.rate / 100}% of price` : "fixed"})`
                      : entry.name
                }
                value={entry.value}
                real={entry.todaysMoney}
                strong={entry.operation === "="}
                shortfall={entry.field === "leftOver" && row.leftOver < 0}
              />
            ))}
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
      <section className="panel" aria-label="The purchase">
        <h2 className="kicker">The purchase</h2>
        <dl className="move-breakdown move-running">
          {ledger.purchase.map((entry) => (
            <Line
              key={entry.field}
              name={entry.name}
              operation={entry.operation}
              value={entry.value}
              real={entry.todaysMoney}
              strong={entry.operation === "="}
            />
          ))}
        </dl>
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
  deposit,
}: {
  mortgage: HouseMoveInputs["mortgage"];
  deposit: HouseMoveInputs["deposit"];
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
      {row !== null && (
        <Breakdown row={row} region={region} asOf={asOf} mortgage={mortgage} deposit={deposit} />
      )}
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
