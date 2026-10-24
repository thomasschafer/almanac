import { serve } from "@hono/node-server";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { openDatabase } from "./db.ts";
import { createStore } from "./store.ts";
import { ownerLogin } from "./tailscale.ts";

const config = loadConfig(process.env);
mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
const db = openDatabase(config.databasePath);

const allowedLogin = config.auth === "tailscale" ? await ownerLogin() : null;
const clientDir = fileURLToPath(new URL("../../dist/client", import.meta.url));

const app = createApp({
  store: createStore(db, () => new Date()),
  allowedLogin,
  links: config.links,
  clientDir: process.env["ALMANAC_API_ONLY"] === "1" ? null : clientDir,
});

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(
    `Listening on http://${info.address}:${String(info.port)}, data in ${config.dataDir}, ` +
      (allowedLogin === null ? "accepting any request" : `only accepting ${allowedLogin}`),
  );
});

function shutdown(): void {
  server.close();
  db.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
