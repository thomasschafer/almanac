import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { asPence, type Pence } from "../../../shared/money.ts";
import {
  type Contribution,
  type PensionMethod,
  type StudentLoanPlan,
  studentLoanPlans,
  type TakeHomeInputs,
} from "../../../shared/take-home/inputs.ts";
import type { InputIssue } from "../../../shared/take-home/result.ts";
import { taxYearRegistry } from "../../../shared/take-home/rules/registry.ts";
import { studentLoanPlanRules } from "../../../shared/take-home/rules/student-loans.ts";
import { NumberInput, percentFormat, poundsFormat, yearFormat } from "../../ui/NumberInput.tsx";
import { Chips, Segmented } from "../../ui/Segmented.tsx";
import { gbp, percent, taxMonthName, taxYearLabel } from "./format.ts";

type Update = (update: (inputs: TakeHomeInputs) => TakeHomeInputs) => void;

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

export function Inputs({
  inputs,
  update,
  issues,
  moreOpen,
  onMoreOpenChange,
}: {
  inputs: TakeHomeInputs;
  update: Update;
  issues: readonly InputIssue[];
  moreOpen: boolean;
  onMoreOpenChange: (open: boolean) => void;
}) {
  const moreId = useId();
  const salaryIssue = issues.find((i) => i.kind === "pension-exceeds-pay" && i.from === "salary");
  const bonusIssue = issues.find((i) => i.kind === "pension-exceeds-pay" && i.from === "bonus");
  const taxCodeIssue = issues.find((i) => i.kind === "invalid-tax-code");

  return (
    <section className="panel inputs" aria-label="Your pay">
      <NumberInput
        label="Salary"
        prefix="£"
        suffix="a year"
        value={inputs.salary}
        format={poundsFormat}
        emptyValue={asPence(0)}
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
        hint={inputs.bonus.amount > 0 ? `Paid in ${taxMonthName(inputs.bonus.month)}` : undefined}
        onChange={(amount) => {
          update((i) => ({ ...i, bonus: { ...i.bonus, amount } }));
        }}
      />
      <ContributionInput
        label={`Pension from salary${inputs.pension.method === "salary-sacrifice" ? ", sacrificed" : ""}`}
        base={inputs.salary}
        baseName="salary"
        value={inputs.pension.fromSalary}
        error={salaryIssue?.message}
        onChange={(fromSalary) => {
          update((i) => ({ ...i, pension: { ...i.pension, fromSalary } }));
        }}
      />
      {inputs.bonus.amount > 0 && (
        <ContributionInput
          label={`Pension from bonus${inputs.pension.method === "salary-sacrifice" ? ", sacrificed" : ""}`}
          base={inputs.bonus.amount}
          baseName="bonus"
          value={inputs.pension.fromBonus}
          error={bonusIssue?.message}
          onChange={(fromBonus) => {
            update((i) => ({ ...i, pension: { ...i.pension, fromBonus } }));
          }}
        />
      )}
      <Chips
        label="Student loans"
        selected={inputs.studentLoans.map((l) => l.plan)}
        options={studentLoanPlans.map((plan) => ({ value: plan, label: planShort[plan] }))}
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
          placeholder="For when it's repaid"
          onChange={(balance) => {
            updateLoan(update, loan.plan, { balance });
          }}
        />
      ))}

      <button
        type="button"
        className="more-toggle"
        aria-expanded={moreOpen}
        aria-controls={moreId}
        onClick={() => {
          onMoreOpenChange(!moreOpen);
        }}
      >
        <span>
          <span className="more-title">More options</span>
          <span className="more-summary">{moreSummary(inputs)}</span>
        </span>
        <ChevronDown size={16} className="more-chevron" aria-hidden />
      </button>

      <div id={moreId} className="more-options" hidden={!moreOpen}>
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
            { value: "rest-of-uk", label: "England, Wales or NI" },
            { value: "scotland", label: "Scotland" },
          ]}
          onChange={(region) => {
            update((i) => ({ ...i, region }));
          }}
        />
        <div className="field">
          <label htmlFor={`${moreId}-month`}>Bonus paid in</label>
          <div className="input select">
            <select
              id={`${moreId}-month`}
              value={inputs.bonus.month}
              onChange={(e) => {
                update((i) => ({
                  ...i,
                  bonus: { ...i.bonus, month: Number(e.currentTarget.value) },
                }));
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
        <div className="field-group">
          <Segmented
            label="Pension type"
            value={inputs.pension.method}
            options={(Object.keys(methodLabels) as PensionMethod[]).map((method) => ({
              value: method,
              label: methodLabels[method],
            }))}
            onChange={(method) => {
              update((i) => ({ ...i, pension: { ...i.pension, method } }));
            }}
          />
          <p className="field-hint">{methodHints[inputs.pension.method]}</p>
        </div>
        <ContributionInput
          label="Employer pension contribution"
          base={inputs.salary}
          baseName="salary"
          value={inputs.pension.employer}
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
          <label htmlFor={`${moreId}-code`}>Tax code</label>
          <div className={`input${taxCodeIssue === undefined ? "" : " input-invalid"}`}>
            <input
              id={`${moreId}-code`}
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
    </section>
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
    inputs.region === "scotland" ? "Scotland" : "England, Wales or NI",
    methodLabels[inputs.pension.method].toLowerCase(),
    `employer ${contributionLabel(inputs.pension.employer)}`,
  ];
  if (inputs.taxCode !== null) parts.push(`code ${inputs.taxCode}`);
  return parts.join(" · ");
}

function contributionLabel(c: Contribution): string {
  return c.kind === "percent" ? percent(c.percent, 2) : `${gbp(c.amount)} a year`;
}

/** A pension contribution as a percentage of some pay, or a fixed amount a year. */
function ContributionInput({
  label,
  base,
  baseName,
  value,
  onChange,
  error,
}: {
  label: string;
  base: Pence;
  baseName: string;
  value: Contribution;
  onChange: (value: Contribution) => void;
  error?: string | undefined;
}) {
  const unitToggle = (
    <div className="unit-toggle" role="radiogroup" aria-label={`${label} as`}>
      {(["percent", "annual"] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          role="radio"
          aria-checked={value.kind === kind}
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
  const hint = error ?? equivalent;
  return value.kind === "percent" ? (
    <NumberInput
      label={label}
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
