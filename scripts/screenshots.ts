// Saves screenshots of the main screens on a phone and a laptop, in light and dark mode, for
// checking visual changes. Usage: node scripts/screenshots.ts <base URL> <output directory>
// Run it against a development or e2e server: it replaces the take-home and house-move states
// with made-up figures first.
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fromPounds } from "../src/shared/money.ts";
import { defaultHouseMoveInputs } from "../src/shared/house-move/defaults.ts";
import { ukDate } from "../src/shared/rule-review.ts";
import type { TakeHomeState } from "../src/shared/take-home/state.ts";
import { exampleInputs, exampleWhatIf } from "../tests/e2e/fixtures.ts";

const [baseUrl, outDir] = process.argv.slice(2);
if (baseUrl === undefined || outDir === undefined) {
  throw new Error("usage: node scripts/screenshots.ts <base URL> <output directory>");
}
mkdirSync(outDir, { recursive: true });

async function setState(state: TakeHomeState): Promise<void> {
  const res = await fetch(`${baseUrl}/api/tools/take-home/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  if (!res.ok) throw new Error(`couldn't set up example figures: ${String(res.status)}`);
}

const viewports = {
  phone: devices["iPhone 15"],
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};
const plain: TakeHomeState = { inputs: exampleInputs, whatIf: null };
const comparing: TakeHomeState = { inputs: exampleInputs, whatIf: exampleWhatIf };
const pages = [
  { name: "house-move", path: "/house-move", state: plain, moreOptions: false },
  { name: "house-move-options", path: "/house-move", state: plain, moreOptions: true },
  { name: "house-move-costs", path: "/house-move", state: plain, moreOptions: true, costs: true },
  { name: "index", path: "/", state: plain },
  { name: "take-home", path: "/take-home", state: plain },
  { name: "take-home-what-if", path: "/take-home", state: comparing },
  { name: "student-loans", path: "/take-home/student-loans", state: plain },
];

const houseMoveResponse = await fetch(`${baseUrl}/api/tools/house-move/state`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    state: {
      inputs: {
        ...defaultHouseMoveInputs(ukDate(new Date()).slice(0, 7)),
        homeValue: fromPounds(200_000),
      },
    },
  }),
});
if (!houseMoveResponse.ok)
  throw new Error(`Couldn't set up house-move figures: ${houseMoveResponse.status}`);

const browser = await chromium.launch();
for (const [device, options] of Object.entries(viewports)) {
  for (const colorScheme of ["light", "dark"] as const) {
    const context = await browser.newContext({ ...options, colorScheme });
    await context.addInitScript(() => {
      localStorage.clear();
    });
    for (const page of pages) {
      await setState(page.state);
      const tab = await context.newPage();
      await tab.goto(`${baseUrl}${page.path}`);
      await tab.waitForLoadState("networkidle");
      if (page.moreOptions === true) {
        await tab.getByRole("button", { name: /More options/ }).click();
        const sheet = tab.getByRole("dialog", { name: "More options" });
        await sheet.waitFor({ state: "visible" });
        if (page.costs === true) {
          await sheet.getByRole("heading", { name: "Costs", exact: true }).evaluate((element) => {
            const heading = element as unknown as {
              scrollIntoView: (options: { block: "start" }) => void;
            };
            heading.scrollIntoView({ block: "start" });
          });
        }
      }
      await tab.screenshot({
        path: join(outDir, `${device}-${colorScheme}-${page.name}.png`),
        fullPage: page.moreOptions !== true,
        animations: "disabled",
      });
      await tab.close();
    }
    await context.close();
  }
}
await browser.close();
console.log(`Saved screenshots to ${outDir}`);
