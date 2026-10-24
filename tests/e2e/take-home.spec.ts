import { expect, type Page, test } from "@playwright/test";
import { exampleInputs } from "./fixtures.ts";

async function resetState(page: Page) {
  const state = await page.request.put("/api/tools/take-home/state", {
    data: { state: { inputs: exampleInputs, whatIf: null } },
  });
  expect(state.ok()).toBe(true);
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
