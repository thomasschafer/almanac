import type { z } from "zod";
import { takeHomeInputs } from "./take-home/inputs.ts";
import { takeHomeState } from "./take-home/state.ts";

/**
 * The tools whose data the server stores: each tool's saved state, and its presets, each
 * validated against its schema on the way in and out.
 */
export const toolSchemas = {
  "take-home": { state: takeHomeState, preset: takeHomeInputs },
} as const satisfies Record<string, { state: z.ZodType; preset: z.ZodType }>;

export type ToolId = keyof typeof toolSchemas;
export type ToolState<T extends ToolId> = z.infer<(typeof toolSchemas)[T]["state"]>;
export type PresetState<T extends ToolId> = z.infer<(typeof toolSchemas)[T]["preset"]>;

export function isToolId(id: string): id is ToolId {
  return Object.hasOwn(toolSchemas, id);
}
