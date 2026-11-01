import { z } from "zod";
import { houseMoveInputs, storedHouseMoveInputs } from "./inputs.ts";

export const houseMoveState = z.strictObject({ inputs: houseMoveInputs });

export type HouseMoveState = z.infer<typeof houseMoveState>;

export const storedHouseMoveState = z.strictObject({ inputs: storedHouseMoveInputs });
