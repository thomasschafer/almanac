import type { z } from "zod";
import { takeHomeInputs } from "./take-home/inputs.ts";

/**
 * The tools whose state the server stores, with the schema it's validated against on the way in
 * and out. A tool's presets use the same schema as its saved state.
 */
export const toolStates = {
  "take-home": takeHomeInputs,
} as const satisfies Record<string, z.ZodType>;

export type ToolId = keyof typeof toolStates;
export type ToolState<T extends ToolId> = z.infer<(typeof toolStates)[T]>;

export function isToolId(id: string): id is ToolId {
  return Object.hasOwn(toolStates, id);
}
