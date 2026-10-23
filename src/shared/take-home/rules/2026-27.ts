import { fromPounds as pounds } from "../../money.ts";
import { confirmed, percent, type IncomeTaxBands, type TaxYearRules } from "./types.ts";

const employerRates = "https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027";
const payeSpecification =
  "https://www.gov.uk/government/publications/payroll-technical-specifications-income-tax";
const incomeOver100k = "https://www.gov.uk/income-tax-rates/income-over-100000";
const annualAllowance = "https://www.gov.uk/tax-on-your-private-pension/annual-allowance";
const taperedAnnualAllowance =
  "https://www.gov.uk/guidance/pension-schemes-work-out-your-tapered-annual-allowance";
const pensionTaxRelief = "https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief";

const restOfUkBands2026To27: IncomeTaxBands = {
  belowBasic: [],
  basic: { name: "Basic", rate: percent(20), width: pounds(37_700) },
  aboveBasic: [{ name: "Higher", rate: percent(40), width: pounds(87_440) }],
  top: { name: "Additional", rate: percent(45) },
};

export const rules2026To27: TaxYearRules = {
  id: "2026-27",
  startYear: 2026,
  lastReviewed: "2026-10-23",
  incomeTax: {
    personalAllowance: confirmed(pounds(12_570), employerRates),
    taperThreshold: confirmed(pounds(100_000), incomeOver100k),
    taperRate: confirmed(percent(50), incomeOver100k, "£1 of allowance for every £2 of income"),
    bands: {
      "rest-of-uk": confirmed(restOfUkBands2026To27, employerRates),
      scotland: confirmed(
        {
          belowBasic: [{ name: "Starter", rate: percent(19), width: pounds(3_967) }],
          basic: { name: "Basic", rate: percent(20), width: pounds(12_989) },
          aboveBasic: [
            { name: "Intermediate", rate: percent(21), width: pounds(14_136) },
            { name: "Higher", rate: percent(42), width: pounds(31_338) },
            { name: "Advanced", rate: percent(45), width: pounds(62_710) },
          ],
          top: { name: "Top", rate: percent(48) },
        },
        employerRates,
        "Widths of taxable income, as in HMRC's PAYE specification (Appendix B).",
      ),
      wales: confirmed(
        restOfUkBands2026To27,
        payeSpecification,
        "Welsh rates match England and Northern Ireland (PAYE specification, Appendix C).",
      ),
    },
    overridingLimit: confirmed(
      percent(50),
      "https://www.gov.uk/hmrc-internal-manuals/paye-manual/paye11095",
    ),
  },
  nationalInsurance: {
    primaryThreshold: confirmed({ annual: pounds(12_570), monthly: pounds(1_048) }, employerRates),
    upperEarningsLimit: confirmed(
      { annual: pounds(50_270), monthly: pounds(4_189) },
      employerRates,
    ),
    mainRate: confirmed(percent(8), employerRates),
    upperRate: confirmed(percent(2), employerRates),
    secondaryThreshold: confirmed({ annual: pounds(5_000), monthly: pounds(417) }, employerRates),
    employerRate: confirmed(percent(15), employerRates),
    salarySacrificeRelief: confirmed({ kind: "unlimited" }, pensionTaxRelief),
  },
  studentLoans: {
    plan1: {
      threshold: confirmed({ annual: pounds(26_900), monthly: pounds(2_241.66) }, employerRates),
      rate: confirmed(percent(9), employerRates),
    },
    plan2: {
      threshold: confirmed({ annual: pounds(29_385), monthly: pounds(2_448.75) }, employerRates),
      rate: confirmed(percent(9), employerRates),
    },
    plan4: {
      threshold: confirmed({ annual: pounds(33_795), monthly: pounds(2_816.25) }, employerRates),
      rate: confirmed(percent(9), employerRates),
    },
    plan5: {
      threshold: confirmed({ annual: pounds(25_000), monthly: pounds(2_083.33) }, employerRates),
      rate: confirmed(percent(9), employerRates),
    },
    postgraduate: {
      threshold: confirmed({ annual: pounds(21_000), monthly: pounds(1_750) }, employerRates),
      rate: confirmed(percent(6), employerRates),
    },
  },
  pensions: {
    annualAllowance: confirmed(pounds(60_000), annualAllowance),
    annualAllowanceTaper: confirmed(
      {
        thresholdIncome: pounds(200_000),
        adjustedIncome: pounds(260_000),
        rate: percent(50),
        minimumAllowance: pounds(10_000),
      },
      taperedAnnualAllowance,
    ),
    reliefAtSourceRate: confirmed(percent(20), pensionTaxRelief),
  },
};
