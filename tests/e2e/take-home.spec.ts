import { expect, type Page, test } from "@playwright/test";
import { asPence } from "../../src/shared/money.ts";
import type { TakeHomeInputs } from "../../src/shared/take-home/inputs.ts";
import { exampleInputs } from "./fixtures.ts";

async function saveInputs(page: Page, inputs: TakeHomeInputs) {
  const state = await page.request.put("/api/tools/take-home/state", {
    data: { state: { inputs, whatIf: null } },
  });
  expect(state.ok()).toBe(true);
}

async function resetState(page: Page) {
  await saveInputs(page, exampleInputs);
  const presets = await page.request.get("/api/tools/take-home/presets");
  const { presets: list } = (await presets.json()) as { presets: { id: string }[] };
  for (const preset of list) {
    await page.request.delete(`/api/tools/take-home/presets/${preset.id}`);
  }
}

test.beforeEach(async ({ page }) => {
  await resetState(page);
  await page.clock.setFixedTime(new Date("2026-10-24T12:00:00Z"));
});

function hero(page: Page) {
  return page.locator(".hero-figure");
}

async function setSalary(page: Page, salary: string) {
  const field = page.getByLabel("Salary", { exact: true });
  await field.fill(salary);
  await field.blur();
}

test("the index links to the tool and the other apps", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Elsewhere/ })).toHaveAttribute(
    "href",
    "https://127.0.0.1:8443/",
  );
  await page.getByRole("link", { name: /Take-home pay/ }).click();
  await expect(page.getByRole("heading", { name: "Take-home pay" })).toBeVisible();
});

test("works out take-home pay and keeps edits across reloads", async ({ page }) => {
  await page.goto("/take-home");
  await expect(hero(page)).toContainText("£4,747");

  await setSalary(page, "50,000");
  await expect(hero(page)).not.toContainText("£4,747");
  const changed = await hero(page).innerText();

  // Saving happens shortly after editing stops.
  await expect
    .poll(async () => {
      const res = await page.request.get("/api/tools/take-home/state");
      const body = (await res.json()) as { saved: { state: { inputs: { salary: number } } } };
      return body.saved.state.inputs.salary;
    })
    .toBe(5_000_000);

  await page.reload();
  await expect(hero(page)).toHaveText(changed);
});

test("another device sees the same state", async ({ page, browser }) => {
  await page.goto("/take-home");
  await setSalary(page, "61,000");
  await expect
    .poll(async () => {
      const res = await page.request.get("/api/tools/take-home/state");
      const body = (await res.json()) as { saved: { state: { inputs: { salary: number } } } };
      return body.saved.state.inputs.salary;
    })
    .toBe(6_100_000);

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(page.url());
  await expect(otherPage.getByLabel("Salary", { exact: true })).toHaveValue("61,000");
  await other.close();
});

test("presets can be saved, loaded and compared", async ({ page }) => {
  await page.goto("/take-home");
  await page.getByRole("button", { name: "Presets" }).click();
  await page.getByLabel("New preset name").fill("Current job");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: /Current job/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await setSalary(page, "120,000");
  await expect(page.getByRole("button", { name: /Current job/ })).toContainText("•");

  await page.getByRole("button", { name: /Current job/ }).click();
  await page.getByRole("button", { name: "Compare" }).click();
  await expect(page.getByRole("heading", { name: /Now.*Current job/ })).toBeVisible();
  await page.getByRole("button", { name: "Stop comparing" }).click();

  await page.getByRole("button", { name: /Current job/ }).click();
  await page.locator(".preset-load").filter({ hasText: "Current job" }).click();
  await expect(page.getByLabel("Salary", { exact: true })).toHaveValue("95,000");
  await expect(hero(page)).toContainText("£4,747");
});

test("flags an invalid tax code next to the field", async ({ page }) => {
  await page.goto("/take-home");
  await page.getByRole("button", { name: /More options/ }).click();
  await page.getByLabel("Tax code").fill("NOTACODE");
  await expect(page.getByLabel("Tax code")).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("That tax code isn't one we recognise")).toBeVisible();
  await page.getByRole("button", { name: /More options/ }).click();
  await page.getByLabel("Tax code").fill("");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(hero(page)).toContainText("£4,747");
});

test("asks for the tax rules to be checked after a Budget", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-02T12:00:00Z"));
  await page.goto("/");
  await page.getByRole("button", { name: /Notifications, \d+ new/ }).click();
  const notice = page.locator(".notice").filter({ hasText: "Check the tax rules after" });
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("Dismissed (1)")).toBeVisible();
});

test("a what-if scenario can be compared, edited and adopted", async ({ page }) => {
  await page.goto("/take-home");
  await page.getByRole("button", { name: "What if…" }).click();
  await expect(page.getByRole("heading", { name: /Now.*What if/ })).toBeVisible();
  await expect(page.locator(".compare-headline")).toContainText("The same take-home each month");

  // Edits go to the what-if scenario, and show what they changed.
  await setSalary(page, "105,000");
  await expect(page.getByText("Now: £95,000")).toBeVisible();
  await expect(page.locator(".compare-headline")).toContainText("+£");

  await page.getByRole("radio", { name: "Now" }).click();
  await expect(page.getByLabel("Salary", { exact: true })).toHaveValue("95,000");

  // The comparison is shared state, so it survives a reload.
  await page.reload();
  await expect(page.getByRole("heading", { name: /Now.*What if/ })).toBeVisible();

  await page.getByRole("button", { name: /Use “What if” from now on/ }).click();
  await expect(page.getByRole("heading", { name: /Now.*What if/ })).toBeHidden();
  await expect(page.getByLabel("Salary", { exact: true })).toHaveValue("105,000");
});

test("the pension type is chosen next to the pension", async ({ page }) => {
  await page.goto("/take-home");
  await page.getByLabel("Pension type").selectOption("net-pay");
  await expect(page.getByLabel("Pension from salary", { exact: true })).toBeVisible();
  await expect(hero(page)).not.toContainText("£4,747");
});

test("the student loan breakdown shows each year and month", async ({ page }) => {
  await page.goto("/take-home");
  await page.getByRole("link", { name: "Breakdown" }).click();
  await expect(page.getByRole("heading", { name: "Student loans" })).toBeVisible();
  const firstYear = page.locator(".year-row").first();
  await expect(firstYear).toContainText("2026/27");
  await firstYear.getByRole("button").click();
  await expect(page.locator(".loan-months tbody tr").first()).toContainText("Oct 2026");
  await page.getByRole("link", { name: "Take-home pay" }).click();
  await expect(hero(page)).toContainText("£4,747");
});

test("a loan with an unknown end says what period its totals cover", async ({ page }) => {
  await saveInputs(page, {
    ...exampleInputs,
    salary: asPence(3_000_000),
    bonus: { ...exampleInputs.bonus, amount: asPence(0) },
    studentLoans: [{ plan: "plan2", balance: asPence(6_000_000), firstRepaymentYear: null }],
  });
  await page.goto("/take-home");
  const panel = page.locator(".loan-panel");
  await expect(panel).toContainText("isn't repaid within the projection");
  await expect(panel.locator(".loan-totals")).toContainText("Repaid to 5 Apr 2086");
  await expect(panel.locator(".loan-totals")).toContainText("Interest added to 5 Apr 2086");
  await expect(panel.locator(".end-dot")).toHaveCount(0);
});

test("says when repayments start, and when a loan is already repaid", async ({ page }) => {
  await saveInputs(page, {
    ...exampleInputs,
    studentLoans: [
      { plan: "plan1", balance: asPence(0), firstRepaymentYear: 2012 },
      { plan: "plan2", balance: asPence(2_500_000), firstRepaymentYear: 2028 },
    ],
  });
  await page.goto("/take-home");
  const panel = page.locator(".loan-panel");
  await expect(panel).toContainText("Plan 1 is already repaid");
  await expect(panel).toContainText("Repayments start in April 2028.");
  await expect(page.getByText("Student loan repayments haven't started yet")).toBeVisible();
  await expect(page.getByText(/Plan 2 repayments start on 6 April 2028/)).toBeVisible();
});

test("a month that refunds tax shows the refund, so the breakdown adds up", async ({ page }) => {
  await saveInputs(page, {
    ...exampleInputs,
    salary: asPence(2_000_000),
    bonus: { amount: asPence(3_000_000), month: 1 },
    pension: {
      ...exampleInputs.pension,
      fromSalary: { kind: "percent", percent: 0 },
      fromBonus: { kind: "percent", percent: 0 },
    },
    studentLoans: [],
  });
  await page.goto("/take-home");
  await expect(page.locator(".summary")).toContainText("refund of tax taken earlier in the year");
  const breakdown = page.locator("section").filter({ has: page.locator("#breakdown-heading") });
  await breakdown.getByRole("radio", { name: "Month" }).click();
  const refund = breakdown.locator(".refund-row");
  await expect(refund).toContainText("Tax refund");
  await expect(refund).toContainText("-£381");
  await expect(breakdown).toContainText("come to more than the gross pay");
});

test("a loan's balance and first repayment year can be cleared", async ({ page }) => {
  await page.goto("/take-home");
  const balance = page.getByLabel("Plan 2 balance");
  await balance.fill("");
  await balance.blur();
  await expect(balance).toHaveValue("");
  await expect(balance).toHaveAttribute("aria-invalid", "false");
  await expect(page.locator(".loan-panel")).toContainText("Add your Plan 2 balance");

  await balance.fill("30,000");
  await balance.blur();
  await page.getByRole("button", { name: /More options/ }).click();
  const year = page.getByLabel("Plan 2: year repayments started");
  await expect(year).toHaveValue("2018");
  await year.fill("");
  await expect(year).toHaveAttribute("aria-invalid", "false");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".loan-panel")).toContainText("Add the year repayments started");

  await expect
    .poll(async () => {
      const res = await page.request.get("/api/tools/take-home/state");
      const body = (await res.json()) as {
        saved: { state: { inputs: TakeHomeInputs } };
      };
      return body.saved.state.inputs.studentLoans;
    })
    .toEqual([{ plan: "plan2", balance: 3_000_000, firstRepaymentYear: null }]);
});

async function savedSalary(page: Page): Promise<number> {
  const res = await page.request.get("/api/tools/take-home/state");
  const body = (await res.json()) as { saved: { state: { inputs: { salary: number } } } };
  return body.saved.state.inputs.salary;
}

test("edits made just before leaving the tool are saved", async ({ page }) => {
  await page.goto("/take-home");
  await page.getByLabel("Salary", { exact: true }).fill("71,000");
  await page.getByRole("link", { name: "Almanac" }).click();
  await expect(page.getByRole("link", { name: /Take-home pay/ })).toBeVisible();
  await expect.poll(() => savedSalary(page)).toBe(7_100_000);
});

test.describe("without a connection to the laptop", () => {
  // Requests a service worker handles skip the page's routes, so block it to fail saves.
  test.use({ serviceWorkers: "block" });

  test("unsaved edits keep a notice that can't be dismissed, wherever you are", async ({
    page,
  }) => {
    await page.route("**/api/tools/take-home/state", (route) =>
      route.request().method() === "PUT" ? route.abort() : route.continue(),
    );
    await page.goto("/take-home");
    await setSalary(page, "72,000");
    await page.getByRole("link", { name: "Almanac" }).click();

    await page.getByRole("button", { name: /Notifications, \d+ new/ }).click();
    const notice = page.locator(".notice").filter({ hasText: "changes aren't saved yet" });
    await expect(notice).toBeVisible();
    await expect(notice.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
    await page.getByRole("button", { name: "Close" }).click();

    await page.unroute("**/api/tools/take-home/state");
    await page.getByRole("link", { name: /Take-home pay/ }).click();
    await expect.poll(() => savedSalary(page)).toBe(7_200_000);
    await page.getByRole("button", { name: /Notifications/ }).click();
    await expect(page.locator(".notice").filter({ hasText: "aren't saved yet" })).toHaveCount(0);
  });
});

test("an open page moves on to the new tax year when it's looked at again", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2027-04-05T12:00:00+01:00"));
  await page.goto("/take-home/student-loans");
  await expect(page.locator(".year-row").first()).toContainText("2026/27");

  await page.clock.setFixedTime(new Date("2027-04-06T12:00:00+01:00"));
  // As the page coming back to the front would. The tests' TypeScript has no DOM types.
  await page.evaluate('document.dispatchEvent(new Event("visibilitychange"))');
  await expect(page.locator(".year-row").first()).toContainText("2027/28");
});

test("a tax code typed with spaces doesn't make a preset look edited", async ({ page }) => {
  await saveInputs(page, { ...exampleInputs, taxCode: "1100L" });
  await page.goto("/take-home");
  await page.getByRole("button", { name: "Presets" }).click();
  await page.getByLabel("New preset name").fill("Coded");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Coded", exact: true })).toBeVisible();

  await page.getByRole("button", { name: /More options/ }).click();
  await page.getByLabel("Tax code").fill("1100l ");
  await expect(page.getByLabel("Tax code")).toHaveValue("1100L");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Coded", exact: true })).toBeVisible();
});

test("the allowance taper callout gives the Scottish rate", async ({ page }) => {
  await saveInputs(page, {
    ...exampleInputs,
    region: "scotland",
    salary: asPence(11_500_000),
    bonus: { ...exampleInputs.bonus, amount: asPence(0) },
    pension: {
      ...exampleInputs.pension,
      method: "relief-at-source",
      fromSalary: { kind: "annual", amount: asPence(500_000) },
    },
  });
  await page.goto("/take-home");
  const callout = page.locator(".callout").filter({ hasText: "allowance is being withdrawn" });
  await expect(callout).toContainText("Between £100,000 and £125,140 of adjusted net income");
  await expect(callout).toContainText("an effective 67.5%");
  await expect(callout).toContainText("Another £10,000 a year into your pension");
  await expect(callout).toContainText("(£8,000 from your pay, with basic-rate relief added)");
});
