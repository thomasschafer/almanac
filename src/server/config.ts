import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const envSchema = z.object({
  ALMANAC_DATA_DIR: z
    .string()
    .min(1)
    .default(join(homedir(), ".local", "share", "almanac")),
  ALMANAC_HOST: z.string().min(1).default("127.0.0.1"),
  ALMANAC_PORT: z.coerce.number().int().min(1).max(65535).default(8790),
  /**
   * "tailscale" only accepts requests that Tailscale Serve forwards from the tailnet user this
   * machine is logged in as. "none" accepts anything that reaches the port, for development and
   * tests.
   */
  ALMANAC_AUTH: z.enum(["tailscale", "none"]).default("tailscale"),
});

export interface Config {
  dataDir: string;
  databasePath: string;
  host: string;
  port: number;
  auth: "tailscale" | "none";
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = envSchema.parse(env);
  return {
    dataDir: parsed.ALMANAC_DATA_DIR,
    databasePath: join(parsed.ALMANAC_DATA_DIR, "almanac.db"),
    host: parsed.ALMANAC_HOST,
    port: parsed.ALMANAC_PORT,
    auth: parsed.ALMANAC_AUTH,
  };
}
