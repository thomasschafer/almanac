import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

describe("loadConfig", () => {
  it("reads links to other apps", () => {
    const links = [{ name: "Notes", description: "Somewhere for notes", httpsPort: 8443 }];
    expect(loadConfig({ ALMANAC_LINKS: JSON.stringify(links) }).links).toEqual(links);
  });

  it("defaults to no links", () => {
    expect(loadConfig({}).links).toEqual([]);
  });

  it("fails on malformed links rather than ignoring them", () => {
    expect(() => loadConfig({ ALMANAC_LINKS: '[{"name":"Notes"}]' })).toThrow(/ALMANAC_LINKS/);
    expect(() => loadConfig({ ALMANAC_LINKS: "not json" })).toThrow(/ALMANAC_LINKS/);
  });
});
