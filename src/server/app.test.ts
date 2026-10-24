import { describe, expect, it } from "vitest";
import { openDatabase } from "./db.ts";
import { jsonRequest, testApp } from "./test-helpers.ts";

const inputs = {
  taxYear: "2026-27",
  region: "rest-of-uk",
  salary: 4_000_000,
  bonus: { amount: 0, month: 12 },
  pension: {
    method: "salary-sacrifice",
    fromSalary: { kind: "percent", percent: 5 },
    fromBonus: { kind: "percent", percent: 0 },
    employer: { kind: "percent", percent: 3 },
    employerNiPassOnPercent: 0,
  },
  studentLoans: [{ plan: "plan2", balance: 2_000_000, firstRepaymentYear: 2020 }],
  taxCode: null,
  projection: { salaryGrowthPercent: 3, rpiPercent: 3 },
};
const state = { inputs, whatIf: { label: "What if", inputs: { ...inputs, salary: 5_000_000 } } };

describe("tool state", () => {
  it("is null until saved, then returns what was saved", async () => {
    const { app } = testApp();
    const empty = await app.request("/api/tools/take-home/state");
    expect(await empty.json()).toEqual({ saved: null });

    const put = await app.request("/api/tools/take-home/state", jsonRequest("PUT", { state }));
    expect(put.status).toBe(200);

    const got = await app.request("/api/tools/take-home/state");
    expect(await got.json()).toEqual({
      saved: { state, updatedAt: "2026-10-23T12:00:00.000Z" },
    });
  });

  it("rejects state that doesn't match the tool's schema", async () => {
    const { app } = testApp();
    const res = await app.request(
      "/api/tools/take-home/state",
      jsonRequest("PUT", { state: { ...state, inputs: { ...inputs, salary: -1 } } }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects unknown keys rather than storing them", async () => {
    const { app } = testApp();
    const res = await app.request(
      "/api/tools/take-home/state",
      jsonRequest("PUT", { state: { ...state, surprise: true } }),
    );
    expect(res.status).toBe(400);
  });

  it("reads state saved before what-if scenarios existed", async () => {
    const { app, dbPath } = testApp();
    const db = openDatabase(dbPath);
    db.prepare("insert into tool_state (tool, state, updated_at) values (?, ?, ?)").run(
      "take-home",
      JSON.stringify(inputs),
      "2026-10-22T12:00:00.000Z",
    );
    db.close();
    const res = await app.request("/api/tools/take-home/state");
    expect(await res.json()).toEqual({
      saved: { state: { inputs, whatIf: null }, updatedAt: "2026-10-22T12:00:00.000Z" },
    });
  });

  it("404s for an unknown tool", async () => {
    const { app } = testApp();
    expect((await app.request("/api/tools/nope/state")).status).toBe(404);
  });

  it("fails loudly if stored state no longer matches its schema", async () => {
    const { app, dbPath } = testApp();
    await app.request("/api/tools/take-home/state", jsonRequest("PUT", { state }));
    const db = openDatabase(dbPath);
    db.prepare("update tool_state set state = ?").run(JSON.stringify({ old: "shape" }));
    db.close();
    expect((await app.request("/api/tools/take-home/state")).status).toBe(500);
  });
});

describe("presets", () => {
  it("can be created, listed, renamed and deleted", async () => {
    const { app } = testApp();
    const created = await app.request(
      "/api/tools/take-home/presets",
      jsonRequest("POST", { name: "Current job", state: inputs }),
    );
    expect(created.status).toBe(201);
    const { preset } = (await created.json()) as { preset: { id: string } };

    const renamed = await app.request(
      `/api/tools/take-home/presets/${preset.id}`,
      jsonRequest("PUT", { name: "Old job", state: inputs }),
    );
    expect(renamed.status).toBe(200);

    const list = (await (await app.request("/api/tools/take-home/presets")).json()) as {
      presets: { name: string }[];
    };
    expect(list.presets.map((p) => p.name)).toEqual(["Old job"]);

    const deleted = await app.request(`/api/tools/take-home/presets/${preset.id}`, {
      method: "DELETE",
    });
    expect(deleted.status).toBe(204);
    const again = await app.request(`/api/tools/take-home/presets/${preset.id}`, {
      method: "DELETE",
    });
    expect(again.status).toBe(404);
  });

  it("refuses two presets with the same name", async () => {
    const { app } = testApp();
    const body = jsonRequest("POST", { name: "Offer", state: inputs });
    expect((await app.request("/api/tools/take-home/presets", body)).status).toBe(201);
    expect((await app.request("/api/tools/take-home/presets", body)).status).toBe(409);
  });
});

describe("access", () => {
  it("only allows the configured tailnet login", async () => {
    const { app } = testApp({ allowedLogin: "owner@example.com" });
    const as = (login?: string) =>
      app.request("/api/tools/take-home/state", {
        headers: login === undefined ? {} : { "Tailscale-User-Login": login },
      });
    expect((await as()).status).toBe(403);
    expect((await as("someone@example.com")).status).toBe(403);
    expect((await as("owner@example.com")).status).toBe(200);
  });

  it("leaves the health check open, for service checks", async () => {
    const { app } = testApp({ allowedLogin: "owner@example.com" });
    expect((await app.request("/api/health")).status).toBe(200);
  });
});
