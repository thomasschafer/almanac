import { SlidersHorizontal, Trash2, Plus } from "lucide-react";
import { useState } from "react";
import { asPence, type Pence } from "../../../shared/money.ts";
import { percent, type Rate, type SignedRate } from "../../../shared/rates.ts";
import { annuityPayment } from "../../../shared/house-move/arithmetic.ts";
import {
  defaultBorrowingCheck,
  defaultHouseMoveInputs,
} from "../../../shared/house-move/defaults.ts";
import { houseMoveInputs, type HouseMoveInputs } from "../../../shared/house-move/inputs.ts";
import { addMonths, tryAddMonths, type Month } from "../../../shared/house-move/months.ts";
import { houseMoveInputProblems } from "../../../shared/house-move/problems.ts";
import { NumberInput, poundsFormat, percentFormat } from "../../ui/NumberInput.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { MoneyField, RateField, CountField, TextField, Group } from "../../ui/Fields.tsx";
import { costAmountLabel, monthLabel } from "./format.ts";
import { EditableRow, MonthField } from "./fields.tsx";

export type Change = (inputs: HouseMoveInputs) => HouseMoveInputs;

type Path = readonly (string | number)[];

/** Where a new ERC band ends: a year after the last, or null if that's past year 9999. */
function nextErcUntil(bands: readonly { until: Month }[], today: Month): Month | null {
  return tryAddMonths(bands.at(-1)?.until ?? today, 12);
}

/** The month a new overpayment defaults to, or null if that's past year 9999. */
function nextOverpaymentMonth(asOf: Month, today: Month): Month | null {
  return tryAddMonths(today > asOf ? today : asOf, 1);
}

function required(next: Month | null): Month {
  if (next === null)
    throw new Error("the button adding this is disabled when there's no next month");
  return next;
}

function pathStartsWith(path: Path, prefix: Path) {
  return prefix.every((part, i) => part === path[i]);
}

export function Inputs({
  inputs: i,
  update,
  today,
}: {
  inputs: HouseMoveInputs;
  update: (change: Change) => void;
  today: Month;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggleRow = (id: string) => {
    setExpanded((current) => (current === id ? null : id));
  };
  const problems = houseMoveInputProblems(i, today);
  const patchMortgage =
    (patch: Partial<HouseMoveInputs["mortgage"]>): Change =>
    (current) => ({ ...current, mortgage: { ...current.mortgage, ...patch } });
  function binding<T>(path: Path, change: (current: HouseMoveInputs, value: T) => HouseMoveInputs) {
    return {
      error: problems.find((p) => pathStartsWith(p.path, path))?.message,
      problem: (value: T) => {
        const parsed = houseMoveInputs.safeParse(change(i, value));
        if (!parsed.success) return parsed.error.issues[0]?.message ?? "Check this value";
        const issue = houseMoveInputProblems(parsed.data, today).find(
          (p) =>
            pathStartsWith(p.path, path) ||
            !problems.some(
              (existing) =>
                existing.kind === p.kind && existing.path.join(".") === p.path.join("."),
            ),
        );
        return issue?.message ?? null;
      },
      onChange: (value: T) => {
        update((current) => change(current, value));
      },
    };
  }
  function money(
    label: string,
    value: Pence,
    path: Path,
    change: (current: HouseMoveInputs, value: Pence) => HouseMoveInputs,
    visibleLabel?: string,
  ) {
    return (
      <MoneyField
        label={label}
        visibleLabel={visibleLabel}
        value={value}
        {...binding(path, change)}
      />
    );
  }
  function rate<T extends Rate | SignedRate>(
    label: string,
    value: T,
    path: Path,
    change: (current: HouseMoveInputs, value: T) => HouseMoveInputs,
    signed = false,
    max = 20,
    visibleLabel?: string,
  ) {
    return (
      <RateField
        label={label}
        visibleLabel={visibleLabel}
        value={value}
        signed={signed}
        max={max}
        {...binding(path, change)}
      />
    );
  }
  const mortgageMoney = (label: string, key: "balance" | "monthlyOverpayment" | "exitFee") =>
    money(label, i.mortgage[key], ["mortgage", key], (current, value) => ({
      ...current,
      mortgage: { ...current.mortgage, [key]: value },
    }));
  const payment = annuityPayment(
    i.mortgage.balance,
    i.mortgage.fixedRate !== null && i.mortgage.fixedRate.until < i.asOf
      ? i.mortgage.fixedRate.followOnRate
      : i.mortgage.rate,
    i.mortgage.remainingMonths,
  );
  const summary = `${i.region === "scotland" ? "Scotland" : "England / NI"} · ${i.costs.length} costs · ${i.mortgage.fixedRate === null ? "No fixed-rate end" : `Fixed to ${monthLabel(i.mortgage.fixedRate.until)}`}${i.borrowingCheck === null ? "" : " · Borrowing check on"}`;

  return (
    <section className="panel inputs" aria-label="Your move">
      {money("Current home value", i.homeValue, ["homeValue"], (current, homeValue) => ({
        ...current,
        homeValue,
      }))}
      {mortgageMoney("Mortgage balance", "balance")}
      {rate("Mortgage rate", i.mortgage.rate, ["mortgage", "rate"], (current, value) => ({
        ...current,
        mortgage: { ...current.mortgage, rate: value },
      }))}
      <div className="field-row">
        <CountField
          label="Remaining term, years"
          value={Math.floor(i.mortgage.remainingMonths / 12)}
          max={50}
          {...binding(["mortgage", "remainingMonths"], (current, value: number) => ({
            ...current,
            mortgage: {
              ...current.mortgage,
              remainingMonths: value * 12 + (current.mortgage.remainingMonths % 12),
            },
          }))}
        />
        <CountField
          label="Remaining term, months"
          value={i.mortgage.remainingMonths % 12}
          max={11}
          {...binding(["mortgage", "remainingMonths"], (current, value: number) => ({
            ...current,
            mortgage: {
              ...current.mortgage,
              remainingMonths: Math.floor(current.mortgage.remainingMonths / 12) * 12 + value,
            },
          }))}
        />
      </div>
      {mortgageMoney("Monthly overpayment", "monthlyOverpayment")}
      {money("Target price", i.targetPrice, ["targetPrice"], (current, targetPrice) => ({
        ...current,
        targetPrice,
      }))}
      <Segmented
        label="Deposit type"
        value={i.deposit.kind}
        options={[
          { value: "percent", label: "% of price" },
          { value: "amount", label: "£ amount" },
        ]}
        onChange={(kind) => {
          update((current) => {
            if (current.deposit.kind === kind) return current;
            const amount =
              current.deposit.kind === "amount"
                ? current.deposit.amount
                : asPence(Math.round((current.targetPrice * current.deposit.rate) / 10_000));
            return {
              ...current,
              deposit:
                kind === "amount"
                  ? { kind, amount }
                  : {
                      kind,
                      rate: percent(
                        current.targetPrice === 0
                          ? 0
                          : Math.min(10_000, Math.round((amount / current.targetPrice) * 10_000)) /
                              100,
                      ),
                    },
            };
          });
        }}
      />
      {i.deposit.kind === "percent"
        ? rate(
            "Deposit",
            i.deposit.rate,
            ["deposit"],
            (current, value) => ({ ...current, deposit: { kind: "percent", rate: value } }),
            false,
            100,
          )
        : money("Deposit", i.deposit.amount, ["deposit"], (current, amount) => ({
            ...current,
            deposit: { kind: "amount", amount },
          }))}
      <button
        type="button"
        className="more-toggle"
        onClick={() => {
          setOpen(true);
        }}
      >
        <span className="more-title">
          <SlidersHorizontal size={16} aria-hidden /> More options
        </span>
        <span className="more-summary">{summary}</span>
      </button>
      <Sheet
        open={open}
        title="More options"
        onClose={() => {
          setOpen(false);
        }}
      >
        <div className="more-options">
          <Group title="Current mortgage">
            <MonthField
              label="Figures as of"
              value={i.asOf}
              {...binding(["asOf"], (current, asOf: string) => ({ ...current, asOf }))}
              hint="After this month's payment. Home value and savings are from this month too."
            />
            <NumberInput
              label="Monthly payment override"
              value={i.mortgage.paymentOverride}
              format={poundsFormat}
              prefix="£"
              nullable
              placeholder={poundsFormat.format(payment)}
              hint={`Calculated payment: £${poundsFormat.format(payment)}. Leave empty to use it.`}
              {...binding(["mortgage", "paymentOverride"], (current, value: Pence | null) => ({
                ...current,
                mortgage: { ...current.mortgage, paymentOverride: value },
              }))}
            />
            <label className="check-field">
              <input
                type="checkbox"
                checked={i.mortgage.fixedRate !== null}
                onChange={(e) => {
                  update(
                    patchMortgage({
                      fixedRate: e.target.checked
                        ? { until: addMonths(today, 24), followOnRate: percent(4.5) }
                        : null,
                    }),
                  );
                }}
              />{" "}
              Fixed rate ends
            </label>
            {i.mortgage.fixedRate !== null && (
              <>
                <MonthField
                  label="Last fixed-rate month"
                  value={i.mortgage.fixedRate.until}
                  hint="The payment changes the month after this."
                  {...binding(["mortgage", "fixedRate"], (current, until: string) => ({
                    ...current,
                    mortgage: {
                      ...current.mortgage,
                      fixedRate: {
                        until,
                        followOnRate: current.mortgage.fixedRate?.followOnRate ?? percent(4.5),
                      },
                    },
                  }))}
                />
                {rate(
                  "Follow-on mortgage rate",
                  i.mortgage.fixedRate.followOnRate,
                  ["mortgage", "fixedRate"],
                  (current, value) => ({
                    ...current,
                    mortgage: {
                      ...current.mortgage,
                      fixedRate: {
                        until: current.mortgage.fixedRate?.until ?? today,
                        followOnRate: value,
                      },
                    },
                  }),
                )}
              </>
            )}
            <h4>Early repayment charges</h4>
            <p className="field-hint">
              Each rate applies through its end month. Selling in that month still pays the charge.
            </p>
            <div className="move-edit-list">
              {i.mortgage.ercBands.map((band, index) => (
                <EditableRow
                  key={index}
                  title={`ERC band ${index + 1}`}
                  summary={`${band.rate / 100}%`}
                  timing={`through ${monthLabel(band.until)}`}
                  open={expanded === `erc-${index}`}
                  onToggle={() => {
                    toggleRow(`erc-${index}`);
                  }}
                >
                  <MonthField
                    label={`ERC band ${index + 1} through month`}
                    value={band.until}
                    {...binding(["mortgage", "ercBands", index], (current, until: string) => ({
                      ...current,
                      mortgage: {
                        ...current.mortgage,
                        ercBands: current.mortgage.ercBands.map((b, n) =>
                          n === index ? { ...b, until } : b,
                        ),
                      },
                    }))}
                  />
                  {rate(
                    `ERC band ${index + 1} rate`,
                    band.rate,
                    ["mortgage", "ercBands", index],
                    (current, value) => ({
                      ...current,
                      mortgage: {
                        ...current.mortgage,
                        ercBands: current.mortgage.ercBands.map((b, n) =>
                          n === index ? { ...b, rate: value } : b,
                        ),
                      },
                    }),
                    false,
                    100,
                  )}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      update((current) => ({
                        ...current,
                        mortgage: {
                          ...current.mortgage,
                          ercBands: current.mortgage.ercBands.filter((_, n) => n !== index),
                        },
                      }));
                    }}
                  >
                    <Trash2 size={14} aria-hidden /> Remove ERC band {index + 1}
                  </button>
                </EditableRow>
              ))}
            </div>
            <button
              type="button"
              className="text-button"
              disabled={nextErcUntil(i.mortgage.ercBands, today) === null}
              onClick={() => {
                setExpanded(`erc-${i.mortgage.ercBands.length}`);
                update((current) => ({
                  ...current,
                  mortgage: {
                    ...current.mortgage,
                    ercBands: [
                      ...current.mortgage.ercBands,
                      {
                        until: required(nextErcUntil(current.mortgage.ercBands, today)),
                        rate: percent(1),
                      },
                    ],
                  },
                }));
              }}
            >
              <Plus size={14} aria-hidden /> Add ERC band
            </button>
            {mortgageMoney("Exit fee", "exitFee")}
            <h4>One-off overpayments</h4>
            <div className="move-edit-list">
              {i.mortgage.oneOffOverpayments.map((entry, index) => (
                <EditableRow
                  key={index}
                  title={`Overpayment ${index + 1}`}
                  summary={`£${poundsFormat.format(entry.amount)}`}
                  timing={monthLabel(entry.month)}
                  open={expanded === `overpayment-${index}`}
                  onToggle={() => {
                    toggleRow(`overpayment-${index}`);
                  }}
                >
                  <MonthField
                    label={`Overpayment ${index + 1} month`}
                    value={entry.month}
                    {...binding(
                      ["mortgage", "oneOffOverpayments", index],
                      (current, month: string) => ({
                        ...current,
                        mortgage: {
                          ...current.mortgage,
                          oneOffOverpayments: current.mortgage.oneOffOverpayments.map((p, n) =>
                            n === index ? { ...p, month } : p,
                          ),
                        },
                      }),
                    )}
                  />
                  {money(
                    `Overpayment ${index + 1} amount`,
                    entry.amount,
                    ["mortgage", "oneOffOverpayments", index],
                    (current, amount) => ({
                      ...current,
                      mortgage: {
                        ...current.mortgage,
                        oneOffOverpayments: current.mortgage.oneOffOverpayments.map((p, n) =>
                          n === index ? { ...p, amount } : p,
                        ),
                      },
                    }),
                  )}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      update((current) => ({
                        ...current,
                        mortgage: {
                          ...current.mortgage,
                          oneOffOverpayments: current.mortgage.oneOffOverpayments.filter(
                            (_, n) => n !== index,
                          ),
                        },
                      }));
                    }}
                  >
                    Remove overpayment {index + 1}
                  </button>
                </EditableRow>
              ))}
            </div>
            <button
              type="button"
              className="text-button"
              disabled={nextOverpaymentMonth(i.asOf, today) === null}
              onClick={() => {
                setExpanded(`overpayment-${i.mortgage.oneOffOverpayments.length}`);
                update((current) => ({
                  ...current,
                  mortgage: {
                    ...current.mortgage,
                    oneOffOverpayments: [
                      ...current.mortgage.oneOffOverpayments,
                      {
                        month: required(nextOverpaymentMonth(current.asOf, today)),
                        amount: asPence(0),
                      },
                    ],
                  },
                }));
              }}
            >
              <Plus size={14} aria-hidden /> Add one-off overpayment
            </button>
            <Segmented
              label="Overpayments"
              value={i.mortgage.overpaymentMode}
              options={[
                { value: "shorten-term", label: "Shorten the term" },
                { value: "lower-payment", label: "Lower the payment" },
              ]}
              onChange={(overpaymentMode) => {
                update(patchMortgage({ overpaymentMode }));
              }}
            />
            {rate(
              "Yearly overpayment allowance",
              i.mortgage.annualOverpaymentAllowance,
              ["mortgage", "annualOverpaymentAllowance"],
              (current, value) => ({
                ...current,
                mortgage: { ...current.mortgage, annualOverpaymentAllowance: value },
              }),
              false,
              100,
            )}
            <p className="field-hint">
              Percentage of the opening balance for each 12 months of the fix, measured from the
              as-of month. Excess payments are warned about, not prevented.
            </p>
          </Group>
          <Group title="Growth and inflation">
            {rate(
              "Current home yearly growth",
              i.growth.home,
              ["growth", "home"],
              (current, home) => ({ ...current, growth: { ...current.growth, home } }),
              true,
            )}
            {rate(
              "Target yearly growth",
              i.growth.target,
              ["growth", "target"],
              (current, target) => ({ ...current, growth: { ...current.growth, target } }),
              true,
            )}
            {rate(
              "Yearly inflation",
              i.growth.inflation,
              ["growth", "inflation"],
              (current, inflation) => ({ ...current, growth: { ...current.growth, inflation } }),
              true,
            )}
          </Group>
          <Group title="Location">
            <Segmented
              label="Next home"
              value={i.region}
              options={[
                { value: "england-ni", label: "England / NI" },
                { value: "scotland", label: "Scotland" },
              ]}
              onChange={(region) => {
                update((current) => ({ ...current, region }));
              }}
            />
          </Group>
          <Group title="Cash">
            {money("Savings", i.cash.savings, ["cash", "savings"], (current, savings) => ({
              ...current,
              cash: { ...current.cash, savings },
            }))}
            {money(
              "Saved each month",
              i.cash.monthlySaving,
              ["cash", "monthlySaving"],
              (current, monthlySaving) => ({
                ...current,
                cash: { ...current.cash, monthlySaving },
              }),
            )}
            {rate(
              "Savings yearly interest",
              i.cash.interestRate,
              ["cash", "interestRate"],
              (current, interestRate) => ({ ...current, cash: { ...current.cash, interestRate } }),
            )}
          </Group>
          <Group title="Costs">
            <p className="field-hint">
              These defaults are typical estimates. Change them to match your quotes. Fixed amounts
              are in the as-of month's money.
            </p>
            <div className="move-edit-list">
              {i.costs.map((cost, index) => {
                const changeCost =
                  (patch: Partial<typeof cost>): Change =>
                  (current) => ({
                    ...current,
                    costs: current.costs.map((c) => (c.id === cost.id ? { ...c, ...patch } : c)),
                  });
                return (
                  <EditableRow
                    key={cost.id}
                    title={cost.name}
                    summary={costAmountLabel(cost)}
                    timing={cost.timing === "completion" ? "at completion" : "up front"}
                    open={expanded === cost.id}
                    onToggle={() => {
                      toggleRow(cost.id);
                    }}
                  >
                    <TextField
                      label={`${cost.name} name`}
                      visibleLabel="Name"
                      value={cost.name}
                      onChange={(name) => {
                        update(changeCost({ name }));
                      }}
                    />
                    <Segmented
                      label={`${cost.name} amount type`}
                      hideLabel
                      value={cost.amount.kind}
                      options={[
                        { value: "fixed", label: "Fixed £" },
                        { value: "sale-percent", label: "% of sale" },
                        { value: "purchase-percent", label: "% of purchase" },
                      ]}
                      onChange={(kind) => {
                        update(
                          changeCost({
                            amount:
                              kind === "fixed"
                                ? { kind, amount: asPence(0) }
                                : { kind, rate: percent(0) },
                          }),
                        );
                      }}
                    />
                    {cost.amount.kind === "fixed"
                      ? money(
                          `${cost.name} amount`,
                          cost.amount.amount,
                          ["costs", index],
                          (current, amount) =>
                            changeCost({ amount: { kind: "fixed", amount } })(current),
                          "Amount",
                        )
                      : rate(
                          `${cost.name} rate`,
                          cost.amount.rate,
                          ["costs", index],
                          (current, value) =>
                            changeCost({
                              amount: {
                                kind:
                                  cost.amount.kind === "sale-percent"
                                    ? "sale-percent"
                                    : "purchase-percent",
                                rate: value,
                              },
                            })(current),
                          false,
                          100,
                          "Amount",
                        )}
                    <label className="check-field">
                      <input
                        type="checkbox"
                        aria-label={`${cost.name} plus VAT`}
                        checked={cost.plusVat}
                        onChange={(e) => {
                          update(changeCost({ plusVat: e.target.checked }));
                        }}
                      />{" "}
                      Plus VAT
                    </label>
                    <Segmented
                      label={`${cost.name} paid`}
                      visibleLabel="Paid"
                      value={cost.timing}
                      options={[
                        { value: "completion", label: "At completion" },
                        { value: "upfront", label: "Up front" },
                      ]}
                      onChange={(timing) => {
                        update(changeCost({ timing }));
                      }}
                    />
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`Remove ${cost.name}`}
                      onClick={() => {
                        update((current) => ({
                          ...current,
                          costs: current.costs.filter((c) => c.id !== cost.id),
                        }));
                      }}
                    >
                      <Trash2 size={14} aria-hidden /> Remove
                    </button>
                  </EditableRow>
                );
              })}
            </div>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const id = crypto.randomUUID();
                setExpanded(id);
                update((current) => ({
                  ...current,
                  costs: [
                    ...current.costs,
                    {
                      id,
                      name: "New cost",
                      amount: { kind: "fixed", amount: asPence(0) },
                      plusVat: false,
                      timing: "completion",
                    },
                  ],
                }));
              }}
            >
              <Plus size={14} aria-hidden /> Add cost
            </button>
            <button
              type="button"
              className="text-button quiet"
              onClick={() => {
                if (window.confirm("Replace all costs with the typical default estimates?")) {
                  setExpanded(null);
                  update((current) => ({ ...current, costs: defaultHouseMoveInputs(today).costs }));
                }
              }}
            >
              Reset costs to defaults
            </button>
          </Group>
          <Group title="Borrowing check">
            <label className="check-field">
              <input
                type="checkbox"
                checked={i.borrowingCheck !== null}
                onChange={(e) => {
                  update((current) => ({
                    ...current,
                    borrowingCheck: e.target.checked ? defaultBorrowingCheck() : null,
                  }));
                }}
              />{" "}
              Check the new mortgage against income
            </label>
            {i.borrowingCheck !== null && (
              <>
                {money(
                  "Gross yearly household income",
                  i.borrowingCheck.annualIncome,
                  ["borrowingCheck", "annualIncome"],
                  (current, annualIncome) => ({
                    ...current,
                    borrowingCheck: {
                      ...(current.borrowingCheck ?? defaultBorrowingCheck()),
                      annualIncome,
                    },
                  }),
                )}
                {rate(
                  "Income yearly growth",
                  i.borrowingCheck.incomeGrowth,
                  ["borrowingCheck", "incomeGrowth"],
                  (current, incomeGrowth) => ({
                    ...current,
                    borrowingCheck: {
                      ...(current.borrowingCheck ?? defaultBorrowingCheck()),
                      incomeGrowth,
                    },
                  }),
                  true,
                )}
                <NumberInput
                  label="Maximum income multiple"
                  value={i.borrowingCheck.multiple}
                  format={percentFormat({ min: 0.01, max: 10 })}
                  {...binding(["borrowingCheck", "multiple"], (current, multiple: number) => ({
                    ...current,
                    borrowingCheck: {
                      ...(current.borrowingCheck ?? defaultBorrowingCheck()),
                      multiple,
                    },
                  }))}
                />
              </>
            )}
          </Group>
          <button
            type="button"
            className="button primary sheet-done"
            onClick={() => {
              setOpen(false);
            }}
          >
            Done
          </button>
        </div>
      </Sheet>
    </section>
  );
}
