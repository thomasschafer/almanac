import { describe, expect, it } from "vitest";
import { rules2026To27 } from "./2026-27.ts";
import { rules2027To28 } from "./2027-28.ts";
import { taxYearRegistry } from "./registry.ts";
import { reviewEvents, takeHomeNotices, taxYearStartYearOf, ukDate } from "./review.ts";

function ids(date: string, registry = taxYearRegistry) {
  return takeHomeNotices(new Date(date), registry).map((notice) => notice.id);
}

describe("takeHomeNotices", () => {
  it("is quiet on the day of the last review", () => {
    expect(ids("2026-10-23T12:00:00Z")).toEqual([]);
  });

  it("is quiet before the Budget and asks for a review after it", () => {
    expect(ids("2026-10-27T23:00:00Z")).toEqual([]);
    expect(ids("2026-10-28T09:00:00Z")).toEqual(["take-home:review-after:uk-budget-2027-28"]);
  });

  it("explains which rules to check", () => {
    const [notice] = takeHomeNotices(new Date("2026-10-29T09:00:00Z"));
    expect(notice).toEqual({
      id: "take-home:review-after:uk-budget-2027-28",
      severity: "warning",
      title: "Check the tax rules after the UK Budget",
      body:
        "The UK Budget for 2027-28 was on 28 October 2026. It can change income tax, NI and " +
        "pension rules for the next tax year. The rules for 2026-27 and 2027-28 were last " +
        "checked before it.",
    });
  });

  it("adds the Scottish Budget once it's passed", () => {
    expect(ids("2026-12-03T12:00:00Z")).toEqual([
      "take-home:review-after:uk-budget-2027-28",
      "take-home:review-after:scottish-budget-2027-28",
    ]);
  });

  it("uses the recurring pattern where there's no known date", () => {
    expect(ids("2027-03-31T12:00:00Z")).toContain(
      "take-home:review-after:hmrc-payroll-figures-2027-28",
    );
    expect(ids("2027-03-30T12:00:00Z")).not.toContain(
      "take-home:review-after:hmrc-payroll-figures-2027-28",
    );
  });

  it("stops asking once the rules have been reviewed after the event", () => {
    const reviewed = [
      { ...rules2026To27, lastReviewed: "2026-10-30" },
      { ...rules2027To28, lastReviewed: "2026-10-30" },
    ];
    expect(ids("2026-11-15T12:00:00Z", reviewed)).toEqual([]);
  });

  it("only asks about years that hadn't ended when the event happened", () => {
    const reviewed = [rules2026To27, { ...rules2027To28, lastReviewed: "2027-09-02" }];
    // The 2028/29 student loan interest change (1 September 2027) is after 2026/27 ended.
    expect(ids("2027-09-02T12:00:00Z", reviewed)).not.toContain(
      "take-home:review-after:student-loan-interest-2028-29",
    );
  });

  it("asks for next year's rules from 1 January", () => {
    const reviewed = [
      { ...rules2026To27, lastReviewed: "2027-12-20" },
      { ...rules2027To28, lastReviewed: "2027-12-20" },
    ];
    expect(ids("2027-12-31T12:00:00Z", reviewed)).toEqual([]);
    expect(takeHomeNotices(new Date("2028-01-01T12:00:00Z"), reviewed)).toEqual([
      {
        id: "take-home:missing-rules:2028-29",
        severity: "info",
        title: "Add the tax rules for 2028-29",
        body: "2028-29 starts on 6 April 2028 and its rules haven't been added yet.",
      },
    ]);
  });

  it("says when six months pass without a review", () => {
    const reviewed = [rules2026To27, { ...rules2027To28, lastReviewed: "2026-11-01" }];
    expect(ids("2027-05-01T12:00:00Z", reviewed)).not.toContain("take-home:stale-rules:2026-11-01");
    expect(ids("2027-05-02T12:00:00Z", reviewed)).toContain("take-home:stale-rules:2026-11-01");
  });

  it("is an error when today's tax year has no rules", () => {
    const notices = takeHomeNotices(new Date("2028-04-06T12:00:00Z"));
    expect(notices[0]).toMatchObject({ id: "take-home:no-rules:2028-29", severity: "error" });
  });

  it("is an error before the first year too", () => {
    expect(ids("2026-04-05T12:00:00Z")).toContain("take-home:no-rules:2025-26");
  });

  it("keeps ids stable between calls", () => {
    expect(ids("2027-06-01T12:00:00Z")).toEqual(ids("2027-06-01T12:00:00Z"));
  });
});

describe("dates", () => {
  it("uses the UK date", () => {
    // 23:30 UTC in summer is already the next day in London.
    expect(ukDate(new Date("2026-07-31T23:30:00Z"))).toBe("2026-08-01");
    expect(ukDate(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
  });

  it("starts tax years on 6 April", () => {
    expect(taxYearStartYearOf("2027-04-05")).toBe(2026);
    expect(taxYearStartYearOf("2027-04-06")).toBe(2027);
  });

  it("lists each series once per tax year", () => {
    const events = reviewEvents(2026, 2029);
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
    expect(events.filter((event) => event.series === "uk-budget")).toHaveLength(4);
  });
});
