import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";
import { asPence, type Pence } from "../../../shared/money.ts";
import {
  type Contribution,
  type PensionMethod,
  pensionMethods,
  type StudentLoanPlan,
  studentLoanPlans,
  type TakeHomeInputs,
} from "../../../shared/take-home/inputs.ts";
import type { InputIssue } from "../../../shared/take-home/result.ts";
import { taxYearRegistry } from "../../../shared/take-home/rules/registry.ts";
import { studentLoanPlanRules } from "../../../shared/take-home/rules/student-loans.ts";
import { NumberInput, percentFormat, poundsFormat, yearFormat } from "../../ui/NumberInput.tsx";
import { Chips, Segmented } from "../../ui/Segmented.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { gbp, percent, taxMonthName, taxYearLabel } from "./format.ts";

type Update = (update: (inputs: TakeHomeInputs) => TakeHomeInputs) => void;

/** The other scenario's inputs when comparing, to show what an edit changed. */
export interface Baseline {
  name: string;
  inputs: TakeHomeInputs;
}

const methodLabels: Record<PensionMethod, string> = {
  "salary-sacrifice": "Salary sacrifice",
  "net-pay": "Net pay",
  "relief-at-source": "Relief at source",
};

const methodHints: Record<PensionMethod, string> = {
  "salary-sacrifice": "Your pay is reduced before tax, NI and student loans.",
  "net-pay": "Taken before tax, but after NI and student loans.",
  "relief-at-source": "Paid from your take-home pay; your provider adds basic-rate tax relief.",
};

const planShort: Record<StudentLoanPlan, string> = {
  plan1: "Plan 1",
  plan2: "Plan 2",
  plan4: "Plan 4",
  plan5: "Plan 5",
  postgraduate: "Postgraduate",
};

function regionLabel(region: TakeHomeInputs["region"]): string {
  return region === "scotland" ? "Scotland" : "England, Wales or NI";
}

function contributionLabel(c: Contribution, baseName: string): string {
  return c.kind === "percent"
    ? `${percent(c.percent, 2)} of ${baseName}`
    : `${gbp(c.amount)} a year`;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** "Now: £40,000", when comparing and the value differs from the other scenario. */
function was<T>(
  baseline: Baseline | null,
  get: (inputs: TakeHomeInputs) => T,
  current: TakeHomeInputs,
  show: (value: T) => string,
): string | undefined {
  if (baseline === null) return undefined;
  const before = get(baseline.inputs);
  return same(before, get(current)) ? undefined : `${baseline.name}: ${show(before)}`;
}

function joinHints(...hints: (string | undefined)[]): string | undefined {
  const present = hints.filter((h) => h !== undefined);
  return present.length === 0 ? undefined : present.join(" · ");
}

export function Inputs({
  inputs,
  update,
  issues,
  baseline,
  scenarioName,
}: {
  inputs: TakeHomeInputs;
  update: Update;
  issues: readonly InputIssue[];
  baseline: Baseline | null;
  /** The name of the scenario being edited, when comparing. */
  scenarioName: string | null;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const salaryIssue = issues.find((i) => i.kind === "pension-exceeds-pay" && i.from === "salary");
  const bonusIssue = issues.find((i) => i.kind === "pension-exceeds-pay" && i.from === "bonus");
  const sacrifice = inputs.pension.method === "salary-sacrifice";
  const moreChanged = baseline !== null && moreSummary(baseline.inputs) !== moreSummary(inputs);

  return (
    <section className="panel inputs" aria-label="Your pay">
      <NumberInput
        label="Salary"
        prefix="£"
        suffix="a year"
        value={inputs.salary}
        format={poundsFormat}
        emptyValue={asPence(0)}
        hint={was(baseline, (i) => i.salary, inputs, gbp)}
        onChange={(salary) => {
          update((i) => ({ ...i, salary }));
        }}
      />
      <NumberInput
        label="Bonus"
        prefix="£"
        suffix="a year"
        value={inputs.bonus.amount}
        format={poundsFormat}
        emptyValue={asPence(0)}
        hint={joinHints(
          inputs.bonus.amount > 0 ? `Paid in ${taxMonthName(inputs.bonus.month)}` : undefined,
          was(baseline, (i) => i.bonus.amount, inputs, gbp),
        )}
        onChange={(amount) => {
          update((i) => ({ ...i, bonus: { ...i.bonus, amount } }));
        }}
      />
      <ContributionInput
        label={sacrifice ? "Pension, sacrificed from salary" : "Pension from salary"}
        accessory={<MethodPicker inputs={inputs} update={update} />}
        base={inputs.salary}
        baseName="salary"
        value={inputs.pension.fromSalary}
        error={salaryIssue?.message}
        changed={was(
          baseline,
          (i) => i.pension.fromSalary,
          inputs,
          (c) => contributionLabel(c, "salary"),
        )}
        onChange={(fromSalary) => {
          update((i) => ({ ...i, pension: { ...i.pension, fromSalary } }));
        }}
      />
      {inputs.bonus.amount > 0 && (
        <ContributionInput
          label={sacrifice ? "Pension, sacrificed from bonus" : "Pension from bonus"}
          base={inputs.bonus.amount}
          baseName="bonus"
          value={inputs.pension.fromBonus}
          error={bonusIssue?.message}
          changed={was(
            baseline,
            (i) => i.pension.fromBonus,
            inputs,
            (c) => contributionLabel(c, "bonus"),
          )}
          onChange={(fromBonus) => {
            update((i) => ({ ...i, pension: { ...i.pension, fromBonus } }));
          }}
        />
      )}
      <Chips
        label="Student loans"
        selected={inputs.studentLoans.map((l) => l.plan)}
        options={studentLoanPlans.map((plan) => ({ value: plan, label: planShort[plan] }))}
        hint={was(
          baseline,
          (i) => i.studentLoans.map((l) => l.plan),
          inputs,
          (plans) => (plans.length === 0 ? "none" : plans.map((p) => planShort[p]).join(", ")),
        )}
        onToggle={(plan, on) => {
          update((i) => ({
            ...i,
            studentLoans: on
              ? [...i.studentLoans, { plan, balance: null, firstRepaymentYear: null }].sort(
                  (a, b) => studentLoanPlans.indexOf(a.plan) - studentLoanPlans.indexOf(b.plan),
                )
              : i.studentLoans.filter((l) => l.plan !== plan),
          }));
        }}
      />
      {inputs.studentLoans.map((loan) => (
        <NumberInput
          key={loan.plan}
          label={`${studentLoanPlanRules[loan.plan].name} balance`}
          prefix="£"
          value={loan.balance}
          format={poundsFormat}
          placeholder="To see when it's repaid"
          hint={was(
            baseline,
            (i) => i.studentLoans.find((l) => l.plan === loan.plan)?.balance ?? null,
            inputs,
            (balance) => (balance === null ? "not set" : gbp(balance)),
          )}
          onChange={(balance) => {
            updateLoan(update, loan.plan, { balance });
          }}
        />
      ))}

      <button
        type="button"
        className="more-toggle"
        aria-haspopup="dialog"
        onClick={() => {
          setMoreOpen(true);
        }}
      >
        <SlidersHorizontal size={16} aria-hidden className="more-icon" />
        <span>
          <span className="more-title">
            More options
            {moreChanged && <span className="changed-dot" aria-label=", changed" />}
          </span>
          <span className="more-summary">{moreSummary(inputs)}</span>
        </span>
      </button>

      <Sheet
        open={moreOpen}
        onClose={() => {
          setMoreOpen(false);
        }}
        title={scenarioName === null ? "More options" : `More options · ${scenarioName}`}
      >
        <MoreOptions inputs={inputs} update={update} issues={issues} baseline={baseline} />
        <button
          type="button"
          className="button primary sheet-done"
          onClick={() => {
            setMoreOpen(false);
          }}
        >
          Done
        </button>
      </Sheet>
    </section>
  );
}

function MethodPicker({ inputs, update }: { inputs: TakeHomeInputs; update: Update }) {
  const id = useId();
  return (
    <span className="inline-select">
      <label htmlFor={id} className="visually-hidden">
        Pension type
      </label>
      <select
        id={id}
        title={methodHints[inputs.pension.method]}
        value={inputs.pension.method}
        onChange={(e) => {
          const value = e.currentTarget.value;
          const method = pensionMethods.find((m) => m === value);
          if (method === undefined) throw new Error(`unknown pension type ${value}`);
          update((i) => ({ ...i, pension: { ...i.pension, method } }));
        }}
      >
        {pensionMethods.map((method) => (
          <option key={method} value={method}>
            {methodLabels[method]}
          </option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden />
    </span>
  );
}

function MoreOptions({
  inputs,
  update,
  issues,
  baseline,
}: {
  inputs: TakeHomeInputs;
  update: Update;
  issues: readonly InputIssue[];
  baseline: Baseline | null;
}) {
  const id = useId();
  const taxCodeIssue = issues.find((i) => i.kind === "invalid-tax-code");
  return (
    <div className="more-options">
      <Segmented
        label="Tax year"
        value={inputs.taxYear}
        options={taxYearRegistry.map((rules) => ({
          value: rules.id,
          label: taxYearLabel(rules.id),
        }))}
        onChange={(taxYear) => {
          update((i) => ({ ...i, taxYear }));
        }}
      />
      <Segmented
        label="Where you live"
        value={inputs.region}
        options={[
          { value: "rest-of-uk", label: regionLabel("rest-of-uk") },
          { value: "scotland", label: regionLabel("scotland") },
        ]}
        onChange={(region) => {
          update((i) => ({ ...i, region }));
        }}
      />
      <div className="field">
        <label htmlFor={`${id}-month`}>Bonus paid in</label>
        <div className="input select">
          <select
            id={`${id}-month`}
            value={inputs.bonus.month}
            onChange={(e) => {
              const month = Number(e.currentTarget.value);
              update((i) => ({ ...i, bonus: { ...i.bonus, month } }));
            }}
          >
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
              <option key={month} value={month}>
                {taxMonthName(month)}
              </option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden className="input-affix" />
        </div>
      </div>
      <ContributionInput
        label="Employer pension contribution"
        base={inputs.salary}
        baseName="salary"
        value={inputs.pension.employer}
        changed={was(
          baseline,
          (i) => i.pension.employer,
          inputs,
          (c) => contributionLabel(c, "salary"),
        )}
        onChange={(employer) => {
          update((i) => ({ ...i, pension: { ...i.pension, employer } }));
        }}
      />
      {inputs.pension.method === "salary-sacrifice" && (
        <NumberInput
          label="Employer's NI saving passed on"
          suffix="%"
          value={inputs.pension.employerNiPassOnPercent}
          format={percentFormat(100)}
          emptyValue={0}
          hint="Some employers add part of the NI they save on your sacrifice to your pension."
          onChange={(employerNiPassOnPercent) => {
            update((i) => ({ ...i, pension: { ...i.pension, employerNiPassOnPercent } }));
          }}
        />
      )}
      <div className="field">
        <label htmlFor={`${id}-code`}>Tax code</label>
        <div className={`input${taxCodeIssue === undefined ? "" : " input-invalid"}`}>
          <input
            id={`${id}-code`}
            className="num"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="Worked out for you"
            value={inputs.taxCode ?? ""}
            aria-invalid={taxCodeIssue !== undefined}
            onChange={(e) => {
              const text = e.currentTarget.value.toUpperCase();
              update((i) => ({ ...i, taxCode: text.trim() === "" ? null : text }));
            }}
          />
        </div>
        <p className="field-hint">
          {taxCodeIssue?.message ??
            "Only if your payslip shows a different code, like 1100L or K500."}
        </p>
      </div>
      {inputs.studentLoans.map((loan) => (
        <NumberInput
          key={loan.plan}
          label={`${studentLoanPlanRules[loan.plan].name}: year repayments started`}
          value={loan.firstRepaymentYear}
          format={yearFormat}
          decimals={false}
          placeholder="Such as 2019"
          hint="The April after you left your course. Loans are written off a set number of years after this."
          onChange={(firstRepaymentYear) => {
            updateLoan(update, loan.plan, { firstRepaymentYear });
          }}
        />
      ))}
      {inputs.studentLoans.length > 0 && (
        <div className="field-row">
          <NumberInput
            label="Pay rises, a year"
            suffix="%"
            value={inputs.projection.salaryGrowthPercent}
            format={percentFormat(50)}
            emptyValue={0}
            onChange={(salaryGrowthPercent) => {
              update((i) => ({ ...i, projection: { ...i.projection, salaryGrowthPercent } }));
            }}
          />
          <NumberInput
            label="Inflation (RPI), a year"
            suffix="%"
            value={inputs.projection.rpiPercent}
            format={percentFormat(30)}
            emptyValue={0}
            onChange={(rpiPercent) => {
              update((i) => ({ ...i, projection: { ...i.projection, rpiPercent } }));
            }}
          />
        </div>
      )}
    </div>
  );
}

function updateLoan(
  update: Update,
  plan: StudentLoanPlan,
  change: Partial<{ balance: Pence; firstRepaymentYear: number }>,
): void {
  update((i) => ({
    ...i,
    studentLoans: i.studentLoans.map((l) => (l.plan === plan ? { ...l, ...change } : l)),
  }));
}

function moreSummary(inputs: TakeHomeInputs): string {
  const parts = [
    taxYearLabel(inputs.taxYear),
    regionLabel(inputs.region),
    `employer ${contributionLabel(inputs.pension.employer, "salary")}`,
  ];
  if (inputs.bonus.amount > 0) parts.push(`bonus in ${taxMonthName(inputs.bonus.month)}`);
  if (inputs.taxCode !== null) parts.push(`code ${inputs.taxCode}`);
  return parts.join(" · ");
}

/** A pension contribution as a percentage of some pay, or a fixed amount a year. */
function ContributionInput({
  label,
  accessory,
  base,
  baseName,
  value,
  onChange,
  error,
  changed,
}: {
  label: string;
  accessory?: React.ReactNode;
  base: Pence;
  baseName: string;
  value: Contribution;
  onChange: (value: Contribution) => void;
  error?: string | undefined;
  /** What the other scenario has, when comparing and it differs. */
  changed?: string | undefined;
}) {
  const unitToggle = (
    <div className="unit-toggle" role="radiogroup" aria-label={`${label} as`}>
      {(["percent", "annual"] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          role="radio"
          aria-checked={value.kind === kind}
          aria-label={kind === "percent" ? `% of ${baseName}` : "£ a year"}
          className={value.kind === kind ? "on" : undefined}
          onClick={() => {
            if (kind !== value.kind) onChange(convert(value, base));
          }}
        >
          {kind === "percent" ? "%" : "£"}
        </button>
      ))}
    </div>
  );
  const equivalent =
    value.kind === "percent"
      ? `${gbp((base * value.percent) / 100)} a year`
      : base > 0
        ? `${percent((value.amount / base) * 100, 1)} of ${baseName}`
        : undefined;
  const hint = error ?? joinHints(equivalent, changed);
  return value.kind === "percent" ? (
    <NumberInput
      label={label}
      labelAccessory={accessory}
      suffix={`% of ${baseName}`}
      value={value.percent}
      format={percentFormat(100)}
      emptyValue={0}
      hint={hint}
      trailing={unitToggle}
      onChange={(p) => {
        onChange({ kind: "percent", percent: p });
      }}
    />
  ) : (
    <NumberInput
      label={label}
      labelAccessory={accessory}
      prefix="£"
      suffix="a year"
      value={value.amount}
      format={poundsFormat}
      emptyValue={asPence(0)}
      hint={hint}
      trailing={unitToggle}
      onChange={(amount) => {
        onChange({ kind: "annual", amount });
      }}
    />
  );
}

/** Switches between a percentage and an amount, keeping roughly the same contribution. */
function convert(value: Contribution, base: Pence): Contribution {
  if (value.kind === "percent") {
    return {
      kind: "annual",
      amount: asPence(Math.round((base * value.percent) / 100 / 100) * 100),
    };
  }
  const p = base > 0 ? Math.min(100, Math.round((value.amount / base) * 1000) / 10) : 0;
  return { kind: "percent", percent: p };
}
