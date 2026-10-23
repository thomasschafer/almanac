// Runs the API for development (`npm run dev:server`), with the defaults in dev.ts. Set
// ALMANAC_PORT or ALMANAC_DATA_DIR to override them.
import { DEV_API_PORT, DEV_DATA_DIR } from "./dev.ts";

process.env["ALMANAC_PORT"] ??= String(DEV_API_PORT);
process.env["ALMANAC_DATA_DIR"] ??= DEV_DATA_DIR;
process.env["ALMANAC_AUTH"] ??= "none";
process.env["ALMANAC_API_ONLY"] ??= "1";
await import("../src/server/main.ts");
