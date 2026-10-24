import type { z } from "zod";
import { takeHomeInputs } from "./take-home/inputs.ts";
import { storedTakeHomeState, takeHomeState } from "./take-home/state.ts";

/**
 * A tool's schemas. `state` is the shape state is written in, which is all the server accepts.
 * `storedState` reads state as it may have been stored or cached, including older shapes, as the
 * current shape.
 */
interface ToolSchemas<S extends z.ZodType, R extends z.ZodType<z.output<S>>, P extends z.ZodType> {
  readonly state: S;
  readonly storedState: R;
  readonly preset: P;
}

function toolSchema<S extends z.ZodType, R extends z.ZodType<z.output<S>>, P extends z.ZodType>(
  schemas: ToolSchemas<S, R, P>,
): ToolSchemas<S, R, P> {
  return schemas;
}

/**
 * The tools whose data the server stores: each tool's saved state, and its presets, each
 * validated against its schema on the way in and out.
 */
export const toolSchemas = {
  "take-home": toolSchema({
    state: takeHomeState,
    storedState: storedTakeHomeState,
    preset: takeHomeInputs,
  }),
} as const;

export type ToolId = keyof typeof toolSchemas;
export type ToolState<T extends ToolId> = z.infer<(typeof toolSchemas)[T]["state"]>;
export type PresetState<T extends ToolId> = z.infer<(typeof toolSchemas)[T]["preset"]>;

export function isToolId(id: string): id is ToolId {
  return Object.hasOwn(toolSchemas, id);
}
