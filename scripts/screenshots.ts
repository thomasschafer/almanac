// Saves screenshots of the main screens on a phone and a laptop, in light and dark mode, for
// checking visual changes. Usage: node scripts/screenshots.ts <base URL> <output directory>
// Run it against a development or e2e server: it replaces the take-home state with made-up
// figures first.
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { exampleInputs } from "../tests/e2e/fixtures.ts";

const [baseUrl, outDir] = process.argv.slice(2);
if (baseUrl === undefined || outDir === undefined) {
  throw new Error("usage: node scripts/screenshots.ts <base URL> <output directory>");
}
mkdirSync(outDir, { recursive: true });

const res = await fetch(`${baseUrl}/api/tools/take-home/state`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ state: exampleInputs }),
});
if (!res.ok) throw new Error(`couldn't set up example figures: ${String(res.status)}`);

const viewports = {
  phone: devices["iPhone 15"],
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};
const pages = [
  { name: "index", path: "/" },
  { name: "take-home", path: "/take-home" },
];

const browser = await chromium.launch();
for (const [device, options] of Object.entries(viewports)) {
  for (const colorScheme of ["light", "dark"] as const) {
    const context = await browser.newContext({ ...options, colorScheme });
    await context.addInitScript(() => {
      localStorage.clear();
    });
    for (const page of pages) {
      const tab = await context.newPage();
      await tab.goto(`${baseUrl}${page.path}`);
      await tab.waitForLoadState("networkidle");
      await tab.screenshot({
        path: join(outDir, `${device}-${colorScheme}-${page.name}.png`),
        fullPage: true,
      });
      await tab.close();
    }
    await context.close();
  }
}
await browser.close();
console.log(`Saved screenshots to ${outDir}`);
