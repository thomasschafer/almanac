import { fromPounds } from "../../src/shared/money.ts";
import { percent } from "../../src/shared/rates.ts";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { defaultHouseMoveInputs } from "../../src/shared/house-move/defaults.ts";
import { maximumInputs } from "../../src/shared/house-move/test-inputs.ts";
import { calculateHouseMove } from "../../src/shared/house-move/engine.ts";

const today = "2026-11";
const inputs = defaultHouseMoveInputs(today);
const hero = (page: Page) => page.locator(".hero-figure");

async function more(page: Page) {
  await page.getByRole("button", { name: /More options/ }).click();
  return page.getByRole("dialog", { name: "More options" });
}

async function setHome(page: Page, value: string) {
  const field = page.getByLabel("Current home value", { exact: true });
  await field.fill(value);
  await field.blur();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-01T12:00:00Z"));
  const saved = await page.request.put("/api/tools/house-move/state", {
    data: { state: { inputs } },
  });
  expect(saved.ok()).toBe(true);
  const response = await page.request.get("/api/tools/house-move/presets");
  const { presets } = (await response.json()) as { presets: { id: string }[] };
  for (const preset of presets) {
    const deleted = await page.request.delete(`/api/tools/house-move/presets/${preset.id}`, {
      headers: { "Content-Type": "application/json" },
    });
    expect(deleted.ok()).toBe(true);
  }
});

test("the index lists House move without figures and defaults match the engine", async ({
  page,
}) => {
  await page.goto("/");
  const link = page.getByRole("link", { name: /House move/ });
  await expect(link).not.toContainText("£");
  await link.click();
  expect(calculateHouseMove(inputs, today).result).toEqual({ kind: "now", month: "2026-11" });
  await expect(hero(page)).toHaveText("Now");
  await expect(page.getByRole("heading", { name: "House move", exact: true })).toBeVisible();
});

test("edits recalculate the date and persist across reloads", async ({ page }) => {
  await page.goto("/house-move");
  await setHome(page, "150000");
  await expect(hero(page)).toHaveText("August 2044");
  await expect(page.locator(".summary-note")).toHaveText("In 17 years 9 months");
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/tools/house-move/state");
      const saved = (await response.json()) as {
        saved: { state: { inputs: { homeValue: number } } };
      };
      return saved.saved.state.inputs.homeValue;
    })
    .toBe(15000000);
  await page.reload();
  await expect(page.getByLabel("Current home value", { exact: true })).toHaveValue("150,000");
  await expect(hero(page)).toHaveText("August 2044");
});

test("invalid input dims results and blur restores the last valid figure", async ({ page }) => {
  await page.goto("/house-move");
  const field = page.getByLabel("Current home value", { exact: true });
  await field.fill("wrong");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".calc-results")).toHaveClass(/(^|\s)stale(\s|$)/);
  await expect(
    page.getByRole("status").filter({ hasText: /Not updated until Current home value/ }),
  ).toBeVisible();
  await field.blur();
  await expect(field).toHaveValue("300,000");
  await expect(page.locator(".calc-results")).not.toHaveClass(/(^|\s)stale(\s|$)/);
});

test("deposit switches between percentage and money without losing its value", async ({ page }) => {
  await page.goto("/house-move");
  await page.getByRole("radio", { name: "£ amount", exact: true }).click();
  await expect(page.getByLabel("Deposit", { exact: true })).toHaveValue("112,500");
  await page.getByRole("radio", { name: "% of price", exact: true }).click();
  await expect(page.getByLabel("Deposit", { exact: true })).toHaveValue("25");
});

test("costs can be added and removed, and Scotland changes buying tax", async ({ page }) => {
  await page.goto("/house-move");
  const breakdown = page.getByRole("region", { name: "Move breakdown", exact: true });
  await expect(breakdown.getByRole("term").filter({ hasText: "SDLT" }).locator("..")).toContainText(
    "£12,500",
  );
  const sheet = await more(page);
  await sheet.getByRole("button", { name: "Add cost", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "Remove New cost", exact: true })).toBeVisible();
  await sheet.getByLabel("New cost amount", { exact: true }).fill("250");
  await sheet.getByRole("button", { name: "Remove New cost", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "Remove New cost", exact: true })).toHaveCount(0);
  await sheet.getByRole("radio", { name: "Scotland", exact: true }).click();
  await sheet.getByRole("button", { name: "Done", exact: true }).click();
  await expect(breakdown.getByRole("term").filter({ hasText: "LBTT" }).locator("..")).toContainText(
    "£18,350",
  );
});

test("presets save, load, rename and delete", async ({ page }) => {
  await page.goto("/house-move");
  await page.getByRole("button", { name: "Presets", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Presets", exact: true });
  await sheet.getByLabel("New preset name").fill("Example move");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet.locator(".preset-load")).toContainText("Example move");
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await setHome(page, "150000");
  await page.getByRole("button", { name: /Example move/ }).click();
  await sheet.locator(".preset-load").click();
  await expect(hero(page)).toHaveText("Now");
  await expect(page.getByLabel("Current home value", { exact: true })).toHaveValue("300,000");
  await page.getByRole("button", { name: /Example move/ }).click();
  await sheet.getByRole("button", { name: "Rename Example move", exact: true }).click();
  await sheet.getByLabel("Preset name", { exact: true }).fill("Renamed move");
  await sheet.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(sheet.locator(".preset-load")).toContainText("Renamed move");
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await sheet.getByRole("button", { name: "Delete Renamed move", exact: true }).click();
  await expect(sheet.locator(".preset-load")).toHaveCount(0);
});

test("the page and options fit the phone viewport and the chart supports a readout", async ({
  page,
}) => {
  await page.goto("/house-move");
  await expect(hero(page)).toHaveText("Now");
  await expect
    .poll(() =>
      page.locator("html").evaluate((element) => {
        const bounds = element as unknown as { scrollWidth: number; clientWidth: number };
        return bounds.scrollWidth <= bounds.clientWidth;
      }),
    )
    .toBe(true);
  const slider = page.getByRole("slider", { name: "Chart month" });
  await slider.fill("12");
  await expect(page.locator(".chart-readout")).toContainText("November 2027");
  const sheet = await more(page);
  await expect
    .poll(() =>
      sheet.evaluate((element) => {
        const bounds = element as unknown as { scrollWidth: number; clientWidth: number };
        return bounds.scrollWidth <= bounds.clientWidth;
      }),
    )
    .toBe(true);
});

test("saved figures still load when time makes the calculation invalid", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  const input = maximumInputs();
  const saved = await page.request.put("/api/tools/house-move/state", {
    data: { state: { inputs: input } },
  });
  expect(saved.ok()).toBe(true);
  await page.clock.setFixedTime(new Date("2050-11-01T12:00:00Z"));
  await page.goto("/house-move");
  await expect(hero(page)).toHaveText("Waiting for valid figures");
  await expect(page.locator(".calc-results")).toHaveAttribute("aria-busy", "true");
  const sheet = await more(page);
  await expect(sheet.getByLabel("Yearly inflation", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(sheet.getByLabel("Current home yearly growth", { exact: true })).toHaveValue("20");
  const response = await page.request.get("/api/tools/house-move/state");
  expect(await response.json()).toMatchObject({ saved: { state: { inputs: input } } });
  expect(errors).toEqual([]);
});

test("cost rows expand in place with short labels and named accessible controls", async ({
  page,
}) => {
  await page.goto("/house-move");
  const sheet = await more(page);
  const agent = sheet.getByRole("button", { name: "Edit Estate agent", exact: true });
  await expect(agent).toHaveAttribute("aria-expanded", "false");
  await expect(agent).toContainText("1.25% of sale + VAT · at completion");
  await agent.click();
  await expect(sheet.getByLabel("Estate agent name", { exact: true })).toBeVisible();
  await expect(sheet.getByLabel("Estate agent rate", { exact: true })).toBeVisible();
  await expect(sheet.getByRole("checkbox", { name: "Estate agent plus VAT" })).toBeChecked();
  await sheet.getByRole("button", { name: "Edit Survey", exact: true }).click();
  await expect(agent).toHaveAttribute("aria-expanded", "false");
  const amount = sheet.getByLabel("Survey amount", { exact: true });
  await amount.fill("850.50");
  await amount.blur();
  await sheet.getByRole("button", { name: "Edit Survey", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "Edit Survey", exact: true })).toContainText(
    "£850.5 · up front",
  );
});

test("month controls use named months and restore invalid month or year edits", async ({
  page,
}) => {
  await page.goto("/house-move");
  const sheet = await more(page);
  const month = sheet.getByRole("combobox", { name: "Figures as of month", exact: true });
  await expect(month.locator("option:checked")).toHaveText("November");
  await month.focus();
  await month.selectOption("12");
  await expect(month).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".calc-results")).toHaveAttribute("aria-busy", "true");
  await month.blur();
  await expect(month).toHaveValue("11");
  const year = sheet.getByLabel("Figures as of year", { exact: true });
  await year.fill("2027");
  await expect(year).toHaveAttribute("aria-invalid", "true");
  await year.blur();
  await expect(year).toHaveValue("2026");
  await month.focus();
  await month.selectOption("10");
  await month.blur();
  await expect(month.locator("option:checked")).toHaveText("October");
});

async function assertVisibleRunningSum(section: Locator): Promise<number> {
  const rows = section.locator(".move-running > .move-line");
  let total = 0;
  let realTotal = 0;
  let subtotalCount = 0;
  for (let index = 0; index < (await rows.count()); index++) {
    const row = rows.nth(index);
    const operation = await row.locator(".move-sign").innerText();
    const shown = await row.locator(".move-nominal").innerText();
    expect(shown).not.toContain(".");
    const value = Number(shown.replace(/[£,+\s]/g, "").replace("−", "-"));
    expect(Number.isSafeInteger(value), shown).toBe(true);
    const quiet = row.locator(".move-real .num");
    const realShown = (await quiet.count()) === 0 ? shown : await quiet.innerText();
    expect(realShown).not.toContain(".");
    const realValue = Number(realShown.replace(/[£,+\s]/g, "").replace("−", "-"));
    expect(Number.isSafeInteger(realValue), realShown).toBe(true);
    if (operation === "=") {
      expect(value, await row.locator("dt").innerText()).toBe(total);
      expect(realValue, `Today’s money: ${await row.locator("dt").innerText()}`).toBe(realTotal);
      subtotalCount++;
    } else {
      expect(["+", "−"]).toContain(operation);
      if (operation === "−") expect(shown).toMatch(/^−£/);
      else expect(shown).toMatch(/^\+£/);
      total += value;
      realTotal += realValue;
    }
  }
  return subtotalCount;
}

test("visible whole-pound subtotals reconcile through the deposit and the purchase", async ({
  page,
}) => {
  const scenario = structuredClone(inputs);
  scenario.mortgage.balance = fromPounds(150000.34);
  scenario.mortgage.ercBands = [{ until: "2027-11", rate: percent(1.5) }];
  scenario.mortgage.exitFee = fromPounds(125.45);
  scenario.cash.savings = fromPounds(7000.77);
  scenario.costs = scenario.costs.map((cost) =>
    cost.id === "arrangement"
      ? { ...cost, amount: { kind: "fixed", amount: fromPounds(999.21) } }
      : cost,
  );
  const saved = await page.request.put("/api/tools/house-move/state", {
    data: { state: { inputs: scenario } },
  });
  expect(saved.ok()).toBe(true);
  await page.goto("/house-move");
  const breakdown = page.getByRole("region", { name: "Move breakdown", exact: true });
  await expect(breakdown.getByText("Deposit (25% of price)", { exact: true })).toBeVisible();
  await expect(breakdown.getByText("Estate agent (incl. VAT)", { exact: true })).toBeVisible();
  expect(await assertVisibleRunningSum(breakdown)).toBe(4);
  expect(
    await assertVisibleRunningSum(page.getByRole("region", { name: "The purchase", exact: true })),
  ).toBe(1);
  await setHome(page, "150000");
  await expect(breakdown.locator(".move-real").first()).toBeVisible();
  expect(await assertVisibleRunningSum(breakdown)).toBe(4);
  expect(
    await assertVisibleRunningSum(page.getByRole("region", { name: "The purchase", exact: true })),
  ).toBe(1);
});

test("the chart matches the running sum and identifies a negative balance as a shortfall", async ({
  page,
}) => {
  await page.goto("/house-move");
  const slider = page.getByRole("slider", { name: "Chart month" });
  await slider.fill("1");
  await slider.fill("0");
  const readout = page.locator(".chart-readout");
  await expect(readout).toContainText("Left for the deposit £128,501");
  await expect(readout).toContainText("Deposit needed £112,500");
  await expect(readout).toContainText("Left over £16,001");
  await setHome(page, "150000");
  await slider.fill("1");
  await slider.fill("0");
  await expect(readout.locator(".move-shortfall")).toContainText("Shortfall −£");
});
