import { describe, expect, it } from "vitest";
import { defaultHouseMoveInputs } from "../shared/house-move/defaults.ts";
import { houseMoveInputProblems } from "../shared/house-move/problems.ts";
import { maximumInputs } from "../shared/house-move/test-inputs.ts";
import { jsonRequest, testApp } from "./test-helpers.ts";

const statePath = "/api/tools/house-move/state";
const presetPath = "/api/tools/house-move/presets";
const inputs = defaultHouseMoveInputs("2026-11");

describe("house-move storage", () => {
  it("round-trips state and rejects unknown keys and invalid money", async () => {
    const { app } = testApp();
    expect(await (await app.request(statePath)).json()).toEqual({ saved: null });
    expect((await app.request(statePath, jsonRequest("PUT", { state: { inputs } }))).status).toBe(
      200,
    );
    expect(await (await app.request(statePath)).json()).toMatchObject({
      saved: { state: { inputs } },
    });
    for (const state of [{ inputs, extra: true }, { inputs: { ...inputs, homeValue: -1 } }]) {
      expect((await app.request(statePath, jsonRequest("PUT", { state }))).status).toBe(400);
    }
  });

  it("creates, loads, updates, renames and deletes presets without touching take-home", async () => {
    const { app } = testApp();
    const created = await app.request(
      presetPath,
      jsonRequest("POST", { name: "Example move", state: inputs }),
    );
    expect(created.status).toBe(201);
    const { preset } = (await created.json()) as { preset: { id: string } };
    const path = `${presetPath}/${preset.id}`;
    const updated = { ...inputs, region: "scotland" };
    expect(
      (await app.request(path, jsonRequest("PUT", { name: "Example move", state: updated })))
        .status,
    ).toBe(200);
    expect((await app.request(path, jsonRequest("PATCH", { name: "Scottish move" }))).status).toBe(
      200,
    );
    expect(await (await app.request(presetPath)).json()).toMatchObject({
      presets: [{ name: "Scottish move", state: updated }],
    });
    expect(await (await app.request("/api/tools/take-home/presets")).json()).toEqual({
      presets: [],
    });
    expect((await app.request(path, jsonRequest("DELETE", undefined))).status).toBe(204);
    expect(await (await app.request(presetPath)).json()).toEqual({ presets: [] });
  });

  it("still reads saved state and presets when time makes their calculation invalid", async () => {
    let now = new Date("2026-11-01T12:00Z");
    const { app } = testApp({ now: () => now });
    const input = maximumInputs();
    expect(houseMoveInputProblems(input, "2026-11")).toEqual([]);
    await app.request(statePath, jsonRequest("PUT", { state: { inputs: input } }));
    await app.request(presetPath, jsonRequest("POST", { name: "Large example", state: input }));
    now = new Date("2050-11-01T12:00Z");
    expect(houseMoveInputProblems(input, "2050-11").length).toBeGreaterThan(0);
    expect(await (await app.request(statePath)).json()).toMatchObject({
      saved: { state: { inputs: input } },
    });
    expect(await (await app.request(presetPath)).json()).toMatchObject({
      presets: [{ state: input }],
    });
  });
});
