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

  it("refuses state in the shape from before what-if scenarios, so it can't drop one", async () => {
    const { app } = testApp();
    await app.request("/api/tools/take-home/state", jsonRequest("PUT", { state }));
    const res = await app.request(
      "/api/tools/take-home/state",
      jsonRequest("PUT", { state: inputs }),
    );
    expect(res.status).toBe(400);
    const got = await app.request("/api/tools/take-home/state");
    expect(await got.json()).toMatchObject({ saved: { state } });
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
      jsonRequest("PATCH", { name: "Old job" }),
    );
    expect(renamed.status).toBe(200);

    const list = (await (await app.request("/api/tools/take-home/presets")).json()) as {
      presets: { name: string }[];
    };
    expect(list.presets.map((p) => p.name)).toEqual(["Old job"]);

    const deleted = await app.request(
      `/api/tools/take-home/presets/${preset.id}`,
      jsonRequest("DELETE", undefined),
    );
    expect(deleted.status).toBe(204);
    const again = await app.request(
      `/api/tools/take-home/presets/${preset.id}`,
      jsonRequest("DELETE", undefined),
    );
    expect(again.status).toBe(404);
  });

  it("can be renamed without touching figures updated since", async () => {
    const { app } = testApp();
    const created = await app.request(
      "/api/tools/take-home/presets",
      jsonRequest("POST", { name: "Offer", state: inputs }),
    );
    const { preset } = (await created.json()) as { preset: { id: string } };
    const path = `/api/tools/take-home/presets/${preset.id}`;
    const updated = { ...inputs, salary: 5_500_000 };
    expect(
      (await app.request(path, jsonRequest("PUT", { name: "Offer", state: updated }))).status,
    ).toBe(200);

    const renamed = await app.request(path, jsonRequest("PATCH", { name: "Second offer" }));
    expect(await renamed.json()).toMatchObject({
      preset: { id: preset.id, name: "Second offer", state: updated },
    });
  });

  it("refuses a rename that also sends figures, or a name that's taken or blank", async () => {
    const { app } = testApp();
    const create = (name: string) =>
      app.request("/api/tools/take-home/presets", jsonRequest("POST", { name, state: inputs }));
    const { preset } = (await (await create("Offer")).json()) as { preset: { id: string } };
    await create("Current job");
    const rename = (body: unknown) =>
      app.request(`/api/tools/take-home/presets/${preset.id}`, jsonRequest("PATCH", body));
    expect((await rename({ name: "Offer", state: inputs })).status).toBe(400);
    expect((await rename({ name: " " })).status).toBe(400);
    expect((await rename({ name: "Current job" })).status).toBe(409);
    expect(
      (
        await app.request(
          "/api/tools/take-home/presets/missing",
          jsonRequest("PATCH", { name: "X" }),
        )
      ).status,
    ).toBe(404);
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

describe("cross-site requests", () => {
  const put = (headers: Record<string, string>) =>
    jsonRequest("PUT", { state }, { Host: "laptop.example.ts.net", ...headers });

  it("refuses changes that aren't sent as JSON", async () => {
    const { app } = testApp();
    const res = await app.request("/api/tools/take-home/presets", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ name: "Offer", state: inputs }),
    });
    expect(res.status).toBe(415);
    const missing = await app.request("/api/tools/take-home/presets/some-id", {
      method: "DELETE",
    });
    expect(missing.status).toBe(415);
  });

  it("accepts JSON with a charset", async () => {
    const { app } = testApp();
    const res = await app.request(
      "/api/tools/take-home/state",
      jsonRequest("PUT", { state }, { "Content-Type": "application/json; charset=utf-8" }),
    );
    expect(res.status).toBe(200);
  });

  it("refuses changes from another site, as browsers describe them", async () => {
    const { app } = testApp();
    for (const site of ["cross-site", "same-site"]) {
      const res = await app.request("/api/tools/take-home/state", put({ "Sec-Fetch-Site": site }));
      expect(res.status).toBe(403);
    }
    expect(
      (await app.request("/api/tools/take-home/state", put({ "Sec-Fetch-Site": "same-origin" })))
        .status,
    ).toBe(200);
  });

  it("refuses changes from another origin when the browser only sends Origin", async () => {
    const { app } = testApp();
    for (const origin of [
      "https://evil.example",
      // Another app on the same machine, on another port.
      "https://laptop.example.ts.net:8443",
      "http://laptop.example.ts.net",
      "null",
    ]) {
      const res = await app.request(
        "/api/tools/take-home/state",
        put({
          Origin: origin,
          "X-Forwarded-Host": "laptop.example.ts.net",
          "X-Forwarded-Proto": "https",
        }),
      );
      expect(res.status, origin).toBe(403);
    }
  });

  it("accepts changes from the app's own pages through Tailscale Serve", async () => {
    const { app } = testApp();
    // Serve forwards HTTPS to the app over plain HTTP, saying what it was asked for.
    const res = await app.request(
      "http://laptop.example.ts.net/api/tools/take-home/state",
      put({
        Origin: "https://laptop.example.ts.net",
        "X-Forwarded-Host": "laptop.example.ts.net",
        "X-Forwarded-Proto": "https",
      }),
    );
    expect(res.status).toBe(200);
  });

  it("accepts changes from the app's own pages without a proxy", async () => {
    const { app } = testApp();
    const res = await app.request(
      "http://127.0.0.1:8790/api/tools/take-home/state",
      jsonRequest("PUT", { state }, { Host: "127.0.0.1:8790", Origin: "http://127.0.0.1:8790" }),
    );
    expect(res.status).toBe(200);
  });

  it("accepts changes from outside a browser, which send neither header", async () => {
    const { app } = testApp();
    expect((await app.request("/api/tools/take-home/state", put({}))).status).toBe(200);
  });

  it("leaves reads alone", async () => {
    const { app } = testApp();
    const res = await app.request("/api/tools/take-home/state", {
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    expect(res.status).toBe(200);
  });
});
