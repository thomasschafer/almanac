import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8792;

export default defineConfig({
  testDir: "tests/e2e",
  // Tests share one server and database, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: process.env["CI"] !== undefined,
  retries: 0,
  reporter: process.env["CI"] === undefined ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    trace: "retain-on-failure",
    timezoneId: "Europe/London",
    locale: "en-GB",
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 15"] } },
    {
      name: "laptop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "node src/server/main.ts",
    url: `http://127.0.0.1:${String(PORT)}/api/health`,
    reuseExistingServer: false,
    env: {
      ALMANAC_DATA_DIR: mkdtempSync(join(tmpdir(), "almanac-e2e-")),
      ALMANAC_PORT: String(PORT),
      ALMANAC_AUTH: "none",
      ALMANAC_LINKS: JSON.stringify([
        { name: "Elsewhere", description: "Another app on this machine", httpsPort: 8443 },
      ]),
    },
  },
});
