import { fromPounds as pounds } from "../../money.ts";
import { rules2026To27 as previous } from "./2026-27.ts";
import { monthlyRepaymentThreshold } from "./student-loans.ts";
import { carriedForward, confirmed, provisional, unchanged, type TaxYearRules } from "./types.ts";

const thresholdFreeze =
  "https://www.gov.uk/government/publications/maintaining-income-tax-and-equivalent-national-insurance-contributions-thresholds-until-5-april-2031";
const budget2025 =
  "https://www.gov.uk/government/publications/budget-2025-document/budget-2025-html";
const announcement2026 =
  "https://www.gov.uk/government/news/student-loans-interest-rates-and-repayment-threshold-announcement--7";
const repaymentRegulations = "https://www.legislation.gov.uk/uksi/2022/1335/regulation/65/made";

const frozenToApril2028 =
  "Frozen until 5 April 2028 by existing legislation, and announced as frozen until 5 April 2031.";
const statutoryUnchanged = "Set in legislation with no change announced.";
const monthlyNotPublished =
  "HMRC hasn't published 2027/28 payroll figures; the monthly figure is the 2026/27 one, " +
  "as the annual figure is unchanged.";

const fromPrevious = previous.id;
const { incomeTax, nationalInsurance, studentLoans, pensions } = previous;

export const rules2027To28: TaxYearRules = {
  id: "2027-28",
  startYear: 2027,
  lastReviewed: "2026-10-28",
  incomeTax: {
    personalAllowance: unchanged(incomeTax.personalAllowance, frozenToApril2028, thresholdFreeze),
    taperThreshold: unchanged(incomeTax.taperThreshold, statutoryUnchanged),
    taperRate: unchanged(incomeTax.taperRate, statutoryUnchanged),
    bands: {
      "rest-of-uk": unchanged(
        incomeTax.bands["rest-of-uk"],
        `${frozenToApril2028} The additional rate threshold isn't indexed.`,
        thresholdFreeze,
      ),
      scotland: provisional(
        incomeTax.bands.scotland.value,
        "https://www.parliament.scot/-/media/files/committees/session-7/finance-committee/correspondence/2026/20260901-draft-scottish-budget-timetable-sg-to-fpac.pdf",
        "The Scottish Budget for 2027/28 is due on 3 December 2026; carried forward from 2026/27.",
      ),
      wales: carriedForward(incomeTax.bands.wales, fromPrevious),
    },
    overridingLimit: unchanged(incomeTax.overridingLimit, statutoryUnchanged),
  },
  nationalInsurance: {
    primaryThreshold: unchanged(
      nationalInsurance.primaryThreshold,
      `${frozenToApril2028} ${monthlyNotPublished}`,
      thresholdFreeze,
    ),
    upperEarningsLimit: unchanged(
      nationalInsurance.upperEarningsLimit,
      `${frozenToApril2028} ${monthlyNotPublished}`,
      thresholdFreeze,
    ),
    mainRate: unchanged(nationalInsurance.mainRate, statutoryUnchanged),
    upperRate: unchanged(nationalInsurance.upperRate, statutoryUnchanged),
    secondaryThreshold: unchanged(
      nationalInsurance.secondaryThreshold,
      `Frozen until April 2028 and announced as frozen until April 2031. ${monthlyNotPublished}`,
      budget2025,
    ),
    employerRate: unchanged(nationalInsurance.employerRate, statutoryUnchanged),
    salarySacrificeRelief: confirmed(
      { kind: "unlimited" },
      budget2025,
      "The £2,000 cap on NI-free salary sacrifice starts in April 2029.",
    ),
  },
  studentLoans: {
    plan1: {
      threshold: confirmed(
        { annual: pounds(28_005), monthly: monthlyRepaymentThreshold(pounds(28_005)) },
        announcement2026,
        "Monthly figure derived from the annual one as HMRC does; not yet published by HMRC.",
      ),
      rate: unchanged(studentLoans.plan1.rate, statutoryUnchanged),
    },
    plan2: {
      threshold: unchanged(
        studentLoans.plan2.threshold,
        "Held at the 2026/27 level from 2027/28 to 2029/30.",
        budget2025,
      ),
      rate: unchanged(studentLoans.plan2.rate, statutoryUnchanged),
    },
    plan4: {
      threshold: carriedForward(studentLoans.plan4.threshold, fromPrevious),
      rate: unchanged(studentLoans.plan4.rate, statutoryUnchanged),
    },
    plan5: {
      threshold: provisional(
        { annual: pounds(26_025), monthly: monthlyRepaymentThreshold(pounds(26_025)) },
        repaymentRegulations,
        "Not yet announced. The regulations uprate £25,000 by RPI (4.1% for March 2026) from " +
          "2027/28, rounded up to £5.",
      ),
      rate: unchanged(studentLoans.plan5.rate, statutoryUnchanged),
    },
    postgraduate: {
      threshold: unchanged(
        studentLoans.postgraduate.threshold,
        "The regulations set a flat £21,000.",
        repaymentRegulations,
      ),
      rate: unchanged(studentLoans.postgraduate.rate, statutoryUnchanged),
    },
  },
  pensions: {
    annualAllowance: unchanged(pensions.annualAllowance, statutoryUnchanged),
    annualAllowanceTaper: unchanged(pensions.annualAllowanceTaper, statutoryUnchanged),
    reliefAtSourceRate: unchanged(
      pensions.reliefAtSourceRate,
      "The basic rate, frozen with the other rates.",
    ),
  },
};
