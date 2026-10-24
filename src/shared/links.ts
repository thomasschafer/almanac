import { z } from "zod";

/** Another app served from the same machine over Tailscale, linked from the index. */
export const appLink = z.strictObject({
  name: z.string().min(1),
  description: z.string().min(1),
  httpsPort: z.number().int().min(1).max(65535),
});
export type AppLink = z.infer<typeof appLink>;
