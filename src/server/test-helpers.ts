import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";
import { createStore } from "./store.ts";

export function testApp(options: { allowedLogin?: string | null; now?: () => Date } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "almanac-test-"));
  const db = openDatabase(join(dir, "almanac.db"));
  const store = createStore(db, options.now ?? (() => new Date("2026-10-23T12:00:00Z")));
  const app = createApp({
    store,
    allowedLogin: options.allowedLogin ?? null,
    clientDir: null,
    links: [],
  });
  return { app, db, dbPath: join(dir, "almanac.db") };
}

export function jsonRequest(method: string, body: unknown, headers: Record<string, string> = {}) {
  return {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}
