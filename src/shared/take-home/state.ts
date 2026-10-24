import { z } from "zod";
import { takeHomeInputs } from "./inputs.ts";

/** A second set of inputs to compare against the current ones. */
export const whatIf = z.strictObject({
  /** Shown as the scenario's name, such as "What if" or the preset it started from. */
  label: z.string().trim().min(1).max(80),
  inputs: takeHomeInputs,
});
export type WhatIf = z.infer<typeof whatIf>;

/** The take-home tool's saved state. Presets only hold inputs. */
export const takeHomeState = z.union([
  z.strictObject({ inputs: takeHomeInputs, whatIf: whatIf.nullable() }),
  // State saved before what-if scenarios existed was just the inputs.
  takeHomeInputs.transform((inputs) => ({ inputs, whatIf: null })),
]);
export type TakeHomeState = z.infer<typeof takeHomeState>;
