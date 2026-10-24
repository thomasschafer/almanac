import { z } from "zod";
import { takeHomeInputs } from "./inputs.ts";

/** A second set of inputs to compare against the current ones. */
export const whatIf = z.strictObject({
  /** Shown as the scenario's name, such as "What if" or the preset it started from. */
  label: z.string().trim().min(1).max(80),
  inputs: takeHomeInputs,
});
export type WhatIf = z.infer<typeof whatIf>;

/** The take-home tool's state, in the shape it's written. Presets only hold inputs. */
export const takeHomeState = z.strictObject({ inputs: takeHomeInputs, whatIf: whatIf.nullable() });
export type TakeHomeState = z.infer<typeof takeHomeState>;

/**
 * State as it may have been stored or cached, read as the current shape. Only reading accepts
 * older shapes: a client still writing one would otherwise drop what newer clients save.
 */
export const storedTakeHomeState = z.union([
  takeHomeState,
  // State saved before what-if scenarios existed was just the inputs.
  takeHomeInputs.transform((inputs): TakeHomeState => ({ inputs, whatIf: null })),
]);
