import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { z } from "zod";
import { calculateTakeHome } from "../../../shared/take-home/engine.ts";
import type { TakeHomeInputs } from "../../../shared/take-home/inputs.ts";
import { projectStudentLoans } from "../../../shared/take-home/projection.ts";
import type {
  StudentLoanProjection,
  TakeHomeCalculation,
  TakeHomeResult,
} from "../../../shared/take-home/result.ts";
import { findTaxYearRules, taxYearRegistry } from "../../../shared/take-home/rules/registry.ts";
import type { TakeHomeState } from "../../../shared/take-home/state.ts";
import { readLocal, writeLocal } from "../../local-store.ts";
import { usePublishNotices } from "../../shell/notices.tsx";
import { type SyncStatus, useToolState } from "../../state/useToolState.ts";
import { defaultInputs } from "./defaults.ts";
import { usePresets } from "./Presets.tsx";

export type Calculation =
  | { kind: "no-rules"; taxYear: string }
  | { kind: "done"; result: TakeHomeResult; projection: StudentLoanProjection };

export function calculate(inputs: TakeHomeInputs, now: Date): Calculation {
  const rules = findTaxYearRules(taxYearRegistry, inputs.taxYear);
  if (rules === undefined) return { kind: "no-rules", taxYear: inputs.taxYear };
  return {
    kind: "done",
    result: calculateTakeHome(inputs, rules),
    projection: projectStudentLoans(inputs, taxYearRegistry, now),
  };
}

/** A calculation that worked out, with its name for display when comparing. */
export interface Scenario {
  name: string;
  inputs: TakeHomeInputs;
  result: TakeHomeCalculation;
  projection: StudentLoanProjection;
}

export type ScenarioId = "now" | "what-if";

/** The name of the current scenario when comparing. */
export const NOW = "Now";

const UI_KEY = "almanac:take-home:ui";
/** Choices kept on this device only. Defaults let older saved choices still load. */
const uiSchema = z.object({
  activePresetId: z.string().nullable().default(null),
  editing: z.enum(["now", "what-if"]).default("now"),
});
type Ui = z.infer<typeof uiSchema>;

function useUi(): [Ui, (change: Partial<Ui>) => void] {
  const [ui, setUi] = useState<Ui>(() => readLocal(UI_KEY, uiSchema) ?? uiSchema.parse({}));
  const change = useCallback((partial: Partial<Ui>) => {
    setUi((current) => {
      const next = { ...current, ...partial };
      writeLocal(UI_KEY, next);
      return next;
    });
  }, []);
  return [ui, change];
}

function syncNotices(status: SyncStatus) {
  return status.kind === "unsaved"
    ? [
        {
          id: "take-home:unsaved",
          toolId: "take-home",
          severity: "warning" as const,
          title: "Take-home changes aren't saved yet",
          body: `They're kept on this device and will be saved when the laptop can be reached. (${status.message})`,
        },
      ]
    : [];
}

export function useTakeHomeValue() {
  const [now] = useState(() => new Date());
  const defaults = useCallback(
    (): TakeHomeState => ({ inputs: defaultInputs(now), whatIf: null }),
    [now],
  );
  const tool = useToolState("take-home", defaults);
  const [ui, setUi] = useUi();
  const presets = usePresets();
  usePublishNotices("take-home:sync", syncNotices(tool.status));

  const state = tool.state;
  const nowCalculation = useMemo(
    () => (state === null ? null : calculate(state.inputs, now)),
    [state, now],
  );
  const whatIfCalculation = useMemo(
    () => (state?.whatIf == null ? null : calculate(state.whatIf.inputs, now)),
    [state, now],
  );
  const editing: ScenarioId = state?.whatIf == null ? "now" : ui.editing;

  return {
    now,
    ...tool,
    ui,
    setUi,
    presets,
    editing,
    nowCalculation,
    whatIfCalculation,
  };
}

export type TakeHome = ReturnType<typeof useTakeHomeValue>;

export const TakeHomeContext = createContext<TakeHome | null>(null);

export function useTakeHome(): TakeHome {
  const value = useContext(TakeHomeContext);
  if (value === null) throw new Error("useTakeHome must be used inside the take-home tool");
  return value;
}

/** Turns a calculation into a scenario, if it worked out. */
export function scenarioOf(
  name: string,
  inputs: TakeHomeInputs,
  calculation: Calculation | null,
): Scenario | null {
  if (calculation?.kind !== "done" || calculation.result.status !== "ok") return null;
  return { name, inputs, result: calculation.result, projection: calculation.projection };
}
