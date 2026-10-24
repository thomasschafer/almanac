import { asPence, type Pence } from "../money.ts";
import {
  floorToPound,
  itemAt,
  minus,
  percentOf,
  positivePart,
  rateOfDown,
  sum,
  wholeRate,
} from "./arithmetic.ts";
import type { StudentLoanPlan, TakeHomeInputs } from "./inputs.ts";
import { marginalRates, type MarginalContext } from "./marginal.ts";
import { employeeNi, employerNi, type NiRates } from "./ni.ts";
import { payYear, reliefAtSourcePaidFromPay, type MonthPay } from "./pay.ts";
import { annualMarginalRate, annualTax, payeYear } from "./paye.ts";
import type {
  AnnualAllowanceCheck,
  EffectiveRates,
  InputIssue,
  MonthResult,
  PayBreakdown,
  PensionBreakdown,
  ProvisionalFigure,
  StudentLoanDeduction,
  TakeHomeFlag,
  TakeHomeResult,
  TaxCodeUsed,
} from "./result.ts";
import {
  ratePercent,
  type Rate,
  type Sourced,
  type TaxRegime,
  type TaxYearRules,
} from "./rules/types.ts";
import {
  repaymentsDue,
  studentLoanRepayments,
  type StudentLoanRules,
} from "./student-loan-repayments.ts";
import { deriveTaxCode, parseTaxCode } from "./tax-code.ts";

const planLabels: Readonly<Record<StudentLoanPlan, string>> = {
  plan1: "Plan 1",
  plan2: "Plan 2",
  plan4: "Plan 4",
  plan5: "Plan 5",
  postgraduate: "Postgraduate Loan",
};

const regimeLabels: Readonly<Record<TaxRegime, string>> = {
  "rest-of-uk": "Income tax bands",
  scotland: "Scottish income tax bands",
  wales: "Welsh income tax bands",
};

/** Reads rule values, remembering any provisional ones so the result can flag them. */
function ruleReader() {
  const provisional = new Map<string, ProvisionalFigure>();
  return {
    use: <T>(sourced: Sourced<T>, label: string): T => {
      if (sourced.status === "provisional") {
        if (sourced.note === undefined) {
          throw new Error(`provisional rule ${label} doesn't say why`);
        }
        provisional.set(label, { label, note: sourced.note, source: sourced.source });
      }
      return sourced.value;
    },
    provisional: (): ProvisionalFigure[] => [...provisional.values()],
  };
}

function pensionBreakdown(
  method: TakeHomeInputs["pension"]["method"],
  parts: {
    employee: Pence;
    employer: Pence;
    employerNiPassOn: Pence;
    paidFromNetPay: Pence;
    providerTopUp: Pence;
  },
): PensionBreakdown {
  switch (method) {
    case "salary-sacrifice":
      return {
        method,
        employee: parts.employee,
        employer: parts.employer,
        employerNiPassOn: parts.employerNiPassOn,
        total: sum([parts.employee, parts.employer, parts.employerNiPassOn]),
      };
    case "net-pay":
      return {
        method,
        employee: parts.employee,
        employer: parts.employer,
        total: sum([parts.employee, parts.employer]),
      };
    case "relief-at-source":
      return {
        method,
        employee: parts.employee,
        paidFromNetPay: parts.paidFromNetPay,
        providerTopUp: parts.providerTopUp,
        employer: parts.employer,
        total: sum([parts.employee, parts.employer]),
      };
  }
}

function pensionParts(pension: PensionBreakdown) {
  return {
    employee: pension.employee,
    employer: pension.employer,
    employerNiPassOn: pension.method === "salary-sacrifice" ? pension.employerNiPassOn : asPence(0),
    paidFromNetPay: pension.method === "relief-at-source" ? pension.paidFromNetPay : asPence(0),
    providerTopUp: pension.method === "relief-at-source" ? pension.providerTopUp : asPence(0),
  };
}

/** What's taken from gross pay for the pension, however it's paid. */
function pensionFromPay(pension: PensionBreakdown): Pence {
  switch (pension.method) {
    case "salary-sacrifice":
    case "net-pay":
      return pension.employee;
    case "relief-at-source":
      return pension.paidFromNetPay;
  }
}

function sumBreakdowns(
  method: TakeHomeInputs["pension"]["method"],
  plans: readonly StudentLoanPlan[],
  months: readonly PayBreakdown[],
): PayBreakdown {
  const total = (pick: (month: PayBreakdown) => Pence) => sum(months.map(pick));
  const pensions = months.map((month) => pensionParts(month.pension));
  const pensionTotal = (pick: (parts: ReturnType<typeof pensionParts>) => Pence) =>
    sum(pensions.map(pick));
  return {
    salary: total((m) => m.salary),
    bonus: total((m) => m.bonus),
    grossPay: total((m) => m.grossPay),
    salarySacrifice: total((m) => m.salarySacrifice),
    pension: pensionBreakdown(method, {
      employee: pensionTotal((p) => p.employee),
      employer: pensionTotal((p) => p.employer),
      employerNiPassOn: pensionTotal((p) => p.employerNiPassOn),
      paidFromNetPay: pensionTotal((p) => p.paidFromNetPay),
      providerTopUp: pensionTotal((p) => p.providerTopUp),
    }),
    niablePay: total((m) => m.niablePay),
    taxablePay: total((m) => m.taxablePay),
    incomeTax: total((m) => m.incomeTax),
    nationalInsurance: total((m) => m.nationalInsurance),
    employerNationalInsurance: total((m) => m.employerNationalInsurance),
    studentLoans: plans.map((plan) => ({
      plan,
      amount: sum(
        months.map((month) => {
          const deduction = month.studentLoans.find((entry) => entry.plan === plan);
          if (deduction === undefined) {
            throw new Error(`no ${plan} deduction in a month`);
          }
          return deduction.amount;
        }),
      ),
    })),
    studentLoanTotal: total((m) => m.studentLoanTotal),
    netPay: total((m) => m.netPay),
  };
}

/** The most common month by net pay, earliest first on a tie. */
function mostCommonMonth(months: readonly MonthResult[]): MonthResult {
  const counts = new Map<number, number>();
  for (const month of months) {
    counts.set(month.netPay, (counts.get(month.netPay) ?? 0) + 1);
  }
  let best: MonthResult | undefined;
  for (const month of months) {
    if (best === undefined || (counts.get(month.netPay) ?? 0) > (counts.get(best.netPay) ?? 0)) {
      best = month;
    }
  }
  if (best === undefined) {
    throw new Error("no months to choose from");
  }
  return best;
}

function percentOfGross(amount: Pence, gross: Pence): number {
  return (100 * amount) / gross;
}

/**
 * Works out a year's take-home pay by simulating monthly PAYE payroll under `rules`, which must be
 * the rules for `inputs.taxYear`. Problems with the inputs (such as a mistyped tax code) come back
 * as an invalid result rather than an exception.
 */
type NotTakenLoan = Extract<TakeHomeFlag, { kind: "student-loans-not-taken" }>["loans"][number];

export function calculateTakeHome(inputs: TakeHomeInputs, rules: TaxYearRules): TakeHomeResult {
  if (inputs.taxYear !== rules.id) {
    throw new Error(`inputs are for ${inputs.taxYear} but the rules are for ${rules.id}`);
  }
  const reader = ruleReader();
  const { use } = reader;
  const { pension } = inputs;
  const plans = inputs.studentLoans.map((loan) => loan.plan);
  const notTaken = inputs.studentLoans.flatMap(
    ({ plan, balance, firstRepaymentYear }): NotTakenLoan[] =>
      balance === 0
        ? [{ plan, reason: { kind: "repaid" } }]
        : firstRepaymentYear !== null && !repaymentsDue(firstRepaymentYear, rules.startYear)
          ? [{ plan, reason: { kind: "not-due", firstRepaymentYear } }]
          : [],
  );
  /**
   * The plans repayments are taken for this year: all but those already repaid or not due until a
   * later year.
   */
  const duePlans = plans.filter((plan) => !notTaken.some((loan) => loan.plan === plan));
  const regionRegime: TaxRegime = inputs.region;
  const bandsFor = (regime: TaxRegime) => use(rules.incomeTax.bands[regime], regimeLabels[regime]);

  const issues: InputIssue[] = [];
  const typedCode = inputs.taxCode?.trim().toUpperCase() ?? null;
  const override = typedCode === null ? null : parseTaxCode(typedCode, bandsFor);
  if (override?.ok === false && typedCode !== null) {
    issues.push({ kind: "invalid-tax-code", input: typedCode, message: override.message });
  }

  const pay = payYear(inputs, {
    reliefAtSourceRate:
      pension.method === "relief-at-source"
        ? use(rules.pensions.reliefAtSourceRate, "Relief at source rate")
        : rules.pensions.reliefAtSourceRate.value,
    salarySacrificeNiRelief:
      pension.method === "salary-sacrifice"
        ? use(rules.nationalInsurance.salarySacrificeRelief, "NI relief on salary sacrifice")
        : rules.nationalInsurance.salarySacrificeRelief.value,
  });
  if (!pay.ok) {
    issues.push(...pay.issues);
  }
  if (!pay.ok || override?.ok === false) {
    return { status: "invalid", issues };
  }
  const payMonths = pay.months;
  const annualOf = (pick: (month: MonthPay) => Pence) => sum(payMonths.map(pick));

  const grossPay = annualOf((m) => m.grossPay);
  const reliefAtSourceGross =
    pension.method === "relief-at-source" ? annualOf((m) => m.employeeContribution) : asPence(0);
  const adjustedNetIncome = minus(
    annualOf((m) => m.taxablePay),
    reliefAtSourceGross,
  );

  const fullAllowance = use(rules.incomeTax.personalAllowance, "Personal allowance");
  const taperThreshold = use(rules.incomeTax.taperThreshold, "Personal allowance taper threshold");
  const taperRate = use(rules.incomeTax.taperRate, "Personal allowance taper rate");
  const allowanceAfterTaper = positivePart(
    minus(
      fullAllowance,
      rateOfDown(positivePart(minus(adjustedNetIncome, taperThreshold)), taperRate),
    ),
  );

  const taxCode: TaxCodeUsed =
    override === null || typedCode === null
      ? deriveTaxCode(allowanceAfterTaper, fullAllowance, regionRegime)
      : { source: "override", code: override.code, display: typedCode };
  const code = taxCode.code;
  const codeRegime = code.kind === "no-tax" ? regionRegime : code.regime;
  const bands = bandsFor(codeRegime);
  const overridingLimit =
    code.kind === "allowance" || code.kind === "k"
      ? use(rules.incomeTax.overridingLimit, "PAYE overriding limit")
      : rules.incomeTax.overridingLimit.value;
  const paye = payeYear(
    code,
    payMonths.map((m) => m.taxablePay),
    bands,
    overridingLimit,
  );

  const ni = rules.nationalInsurance;
  const niRates: NiRates = {
    primaryThreshold: use(ni.primaryThreshold, "NI primary threshold").monthly,
    upperEarningsLimit: use(ni.upperEarningsLimit, "NI upper earnings limit").monthly,
    mainRate: use(ni.mainRate, "NI main rate"),
    upperRate: use(ni.upperRate, "NI upper rate"),
    secondaryThreshold: use(ni.secondaryThreshold, "Employer NI secondary threshold").monthly,
    employerRate: use(ni.employerRate, "Employer NI rate"),
  };
  for (const plan of duePlans) {
    use(rules.studentLoans[plan].threshold, `${planLabels[plan]} repayment threshold`);
    use(rules.studentLoans[plan].rate, `${planLabels[plan]} repayment rate`);
  }
  const studentLoanRules: StudentLoanRules = rules.studentLoans;

  const months = payMonths.map((month, index): MonthResult => {
    const incomeTax = itemAt(paye.tax, index);
    const nationalInsurance = employeeNi(month.niablePay, niRates);
    const employerNationalInsurance = employerNi(month.niablePay, niRates);
    const employerNiPassOn =
      pension.method === "salary-sacrifice"
        ? percentOf(
            minus(employerNi(month.grossPay, niRates), employerNationalInsurance),
            pension.employerNiPassOnPercent,
          )
        : asPence(0);
    const dueRepayments = studentLoanRepayments(month.niablePay, duePlans, studentLoanRules);
    const studentLoans = plans.map((plan): StudentLoanDeduction => {
      if (!duePlans.includes(plan)) {
        return { plan, amount: asPence(0) };
      }
      const deduction = dueRepayments.find((entry) => entry.plan === plan);
      if (deduction === undefined) {
        throw new Error(`no ${plan} repayment worked out`);
      }
      return deduction;
    });
    const studentLoanTotal = sum(studentLoans.map((deduction) => deduction.amount));
    const monthPension = pensionBreakdown(pension.method, {
      employee: month.employeeContribution,
      employer: month.employerContribution,
      employerNiPassOn,
      paidFromNetPay: month.reliefAtSourcePaid,
      providerTopUp: month.reliefAtSourceTopUp,
    });
    const netPay = asPence(
      month.grossPay -
        pensionFromPay(monthPension) -
        incomeTax -
        nationalInsurance -
        studentLoanTotal,
    );
    return {
      month: month.month,
      isBonusMonth: month.bonus > 0,
      salary: month.salary,
      bonus: month.bonus,
      grossPay: month.grossPay,
      salarySacrifice: month.salarySacrifice,
      pension: monthPension,
      niablePay: month.niablePay,
      taxablePay: month.taxablePay,
      incomeTax,
      nationalInsurance,
      employerNationalInsurance,
      studentLoans,
      studentLoanTotal,
      netPay,
    };
  });

  const negative = months.filter((month) => month.netPay < 0);
  if (negative.length > 0) {
    return {
      status: "invalid",
      issues: negative.map((month) => ({
        kind: "negative-net-pay",
        month: month.month,
        message: `Deductions are more than pay in month ${String(month.month)}.`,
      })),
    };
  }

  const annual = sumBreakdowns(pension.method, plans, months);
  const bonusMonth = months.find((month) => month.isBonusMonth) ?? null;
  const nonBonusMonths = months.filter((month) => !month.isBonusMonth);
  const nonBonusNetPay = nonBonusMonths.map((month) => month.netPay);

  const reliefAtSourceClaimable =
    pension.method === "relief-at-source"
      ? (() => {
          const regionBands = bandsFor(regionRegime);
          const taxableIncome = positivePart(minus(annual.taxablePay, allowanceAfterTaper));
          return minus(
            annualTax(taxableIncome, regionBands),
            annualTax(taxableIncome, regionBands, reliefAtSourceGross),
          );
        })()
      : null;

  const standardAllowance = use(rules.pensions.annualAllowance, "Pension annual allowance");
  const aaTaper = use(rules.pensions.annualAllowanceTaper, "Pension annual allowance taper");
  const pensionInput = annual.pension.total;
  const thresholdIncome = minus(
    minus(
      grossPay,
      annualOf((m) => m.netPayContribution),
    ),
    reliefAtSourceGross,
  );
  const adjustedIncome = sum([
    grossPay,
    annual.pension.employer,
    pensionParts(annual.pension).employerNiPassOn,
  ]);
  const aaTapered =
    thresholdIncome > aaTaper.thresholdIncome && adjustedIncome > aaTaper.adjustedIncome;
  // The reduction is rounded down to the pound before the minimum applies (PTM057100):
  // https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm057100
  const allowance = aaTapered
    ? asPence(
        Math.max(
          aaTaper.minimumAllowance,
          standardAllowance -
            floorToPound(rateOfDown(minus(adjustedIncome, aaTaper.adjustedIncome), aaTaper.rate)),
        ),
      )
    : standardAllowance;
  const annualAllowance: AnnualAllowanceCheck = {
    standardAllowance,
    allowance,
    tapered: aaTapered,
    thresholdIncome,
    adjustedIncome,
    pensionInput,
    excess: positivePart(minus(pensionInput, allowance)),
  };

  const inTaper = adjustedNetIncome > taperThreshold && allowanceAfterTaper > 0;
  const marginalContext: MarginalContext = {
    months: payMonths,
    bonusMonth: inputs.bonus.month,
    code,
    bands,
    taperRate:
      taxCode.source === "derived" && adjustedNetIncome >= taperThreshold && allowanceAfterTaper > 0
        ? taperRate
        : null,
    niRates,
    plans: duePlans,
    studentLoanRules,
    method: pension.method,
    reliefAtSourceRate: rules.pensions.reliefAtSourceRate.value,
    niableFractionOfSacrifice: pay.niableFractionOfSacrifice,
  };

  const effectiveRates: EffectiveRates | null =
    grossPay === 0
      ? null
      : {
          incomeTaxPercent: percentOfGross(annual.incomeTax, grossPay),
          nationalInsurancePercent: percentOfGross(annual.nationalInsurance, grossPay),
          studentLoansPercent: percentOfGross(annual.studentLoanTotal, grossPay),
          totalPercent: percentOfGross(
            sum([annual.incomeTax, annual.nationalInsurance, annual.studentLoanTotal]),
            grossPay,
          ),
        };

  const flags: TakeHomeFlag[] = [];
  if (inTaper) {
    if (taperRate <= 0) {
      throw new Error("the allowance can't be tapered at a rate of 0");
    }
    const regionBands = bandsFor(regionRegime);
    const taxableIncome = positivePart(minus(annual.taxablePay, allowanceAfterTaper));
    const bandRate = annualMarginalRate(taxableIncome, regionBands, reliefAtSourceGross);
    const extraGross = minus(adjustedNetIncome, taperThreshold);
    flags.push({
      kind: "allowance-taper",
      adjustedNetIncome,
      band: {
        from: taperThreshold,
        to: asPence(taperThreshold + Math.ceil((fullAllowance * wholeRate) / taperRate)),
      },
      effectiveRatePercent: ratePercent(((bandRate * (wholeRate + taperRate)) / wholeRate) as Rate),
      extraPensionToExit:
        pension.method === "relief-at-source"
          ? {
              method: pension.method,
              gross: extraGross,
              paidFromNetPay: reliefAtSourcePaidFromPay(
                extraGross,
                rules.pensions.reliefAtSourceRate.value,
              ),
            }
          : { method: pension.method, gross: extraGross },
    });
  }
  if (annualAllowance.excess > 0) {
    flags.push({
      kind: "annual-allowance-exceeded",
      pensionInput,
      allowance,
      excess: annualAllowance.excess,
      tapered: aaTapered,
    });
  }
  if (
    taxCode.source === "override" &&
    (codeRegime === "scotland") !== (regionRegime === "scotland")
  ) {
    flags.push({ kind: "tax-code-region-mismatch", codeRegime, region: inputs.region });
  }
  if (notTaken.length > 0) {
    flags.push({ kind: "student-loans-not-taken", loans: notTaken });
  }
  if (paye.notDeducted > 0) {
    flags.push({ kind: "tax-not-deducted", amount: paye.notDeducted });
  }
  const provisional = reader.provisional();
  if (provisional.length > 0) {
    flags.push({ kind: "provisional-figures", figures: provisional });
  }

  return {
    status: "ok",
    taxYear: rules.id,
    region: inputs.region,
    taxCode,
    months,
    normalMonth: mostCommonMonth(nonBonusMonths),
    bonusMonth,
    nonBonusNetPayRange: {
      min: asPence(Math.min(...nonBonusNetPay)),
      max: asPence(Math.max(...nonBonusNetPay)),
    },
    annual,
    incomeTaxNotDeducted: paye.notDeducted,
    reliefAtSourceClaimable,
    adjustedNetIncome,
    personalAllowance: { full: fullAllowance, afterTaper: allowanceAfterTaper },
    effectiveRates,
    marginalRates: {
      salary: marginalRates(marginalContext, "salary", pension.fromSalary),
      bonus: marginalRates(marginalContext, "bonus", pension.fromBonus),
    },
    annualAllowance,
    flags,
  };
}
