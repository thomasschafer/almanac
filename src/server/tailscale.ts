import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { z } from "zod";

const run = promisify(execFile);

/** The tailscale CLI: on the PATH, or inside the macOS app, which doesn't put it there. */
function tailscaleBin(): string {
  const app = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
  return existsSync(app) ? app : "tailscale";
}

const statusSchema = z.object({
  Self: z.object({ UserID: z.number() }),
  User: z.record(z.string(), z.object({ LoginName: z.string().min(1) })),
});

/** Parses `tailscale status --json` for the login of the user this machine is signed in as. */
export function parseOwnerLogin(statusJson: string): string {
  const status = statusSchema.parse(JSON.parse(statusJson));
  const user = status.User[String(status.Self.UserID)];
  if (user === undefined) {
    throw new Error("tailscale status doesn't describe this machine's user; is it logged in?");
  }
  return user.LoginName;
}

/**
 * The tailnet login of this machine's owner. Tailscale Serve tells the app who sent each request
 * in the Tailscale-User-Login header, so requests from anyone else can be refused.
 */
export async function ownerLogin(): Promise<string> {
  const { stdout } = await run(tailscaleBin(), ["status", "--json"]);
  return parseOwnerLogin(stdout);
}
