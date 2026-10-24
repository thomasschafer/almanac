import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { calculateTakeHome } from "../../../shared/take-home/engine.ts";
import type { TakeHomeInputs } from "../../../shared/take-home/inputs.ts";
import { projectStudentLoans } from "../../../shared/take-home/projection.ts";
import type { StudentLoanProjection, TakeHomeResult } from "../../../shared/take-home/result.ts";
import { findTaxYearRules, taxYearRegistry } from "../../../shared/take-home/rules/registry.ts";
import { readLocal, writeLocal } from "../../local-store.ts";
import { PageHeader } from "../../shell/PageHeader.tsx";
import { usePublishNotices } from "../../shell/notices.tsx";
import { type SyncStatus, useToolState } from "../../state/useToolState.ts";
import { Compare } from "./Compare.tsx";
import { currentTaxYear, defaultInputs } from "./defaults.ts";
import { taxYearLabel } from "./format.ts";
import { Inputs } from "./Inputs.tsx";
import { LoanChart } from "./LoanChart.tsx";
import { PresetsButton, usePresets } from "./Presets.tsx";
import {
  Breakdown,
  Callout,
  Insights,
  Issues,
  Months,
  NextPound,
  StickySummary,
  Summary,
} from "./Results.tsx";

const UI_KEY = "almanac:take-home:ui";
const uiSchema = z.object({
  moreOpen: z.boolean(),
  activePresetId: z.string().nullable(),
  comparePresetId: z.string().nullable(),
});
type Ui = z.infer<typeof uiSchema>;

function useUi(): [Ui, (change: Partial<Ui>) => void] {
  const [ui, setUi] = useState<Ui>(
    () =>
      readLocal(UI_KEY, uiSchema) ?? {
        moreOpen: false,
        activePresetId: null,
        comparePresetId: null,
      },
  );
  const change = useCallback((partial: Partial<Ui>) => {
    setUi((current) => {
      const next = { ...current, ...partial };
      writeLocal(UI_KEY, next);
      return next;
    });
  }, []);
  return [ui, change];
}

type Calculation =
  | { kind: "no-rules"; taxYear: string }
  | { kind: "done"; result: TakeHomeResult; projection: StudentLoanProjection };

function calculate(inputs: TakeHomeInputs, now: Date): Calculation {
  const rules = findTaxYearRules(taxYearRegistry, inputs.taxYear);
  if (rules === undefined) return { kind: "no-rules", taxYear: inputs.taxYear };
  return {
    kind: "done",
    result: calculateTakeHome(inputs, rules),
    projection: projectStudentLoans(inputs, taxYearRegistry, now),
  };
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

export default function TakeHomePage() {
  const [now] = useState(() => new Date());
  const defaults = useCallback(() => defaultInputs(now), [now]);
  const {
    state: inputs,
    setState,
    replaceState,
    status,
    retry,
  } = useToolState("take-home", defaults);
  const [ui, setUi] = useUi();
  const { presets, error: presetsError, reload: reloadPresets } = usePresets();
  const [heroVisible, setHeroVisible] = useState(true);

  usePublishNotices("take-home:sync", syncNotices(status));

  const calculation = useMemo(
    () => (inputs === null ? null : calculate(inputs, now)),
    [inputs, now],
  );
  const compared = presets?.find((p) => p.id === ui.comparePresetId) ?? null;
  const comparedCalculation = useMemo(
    () => (compared === null ? null : calculate(compared.state, now)),
    [compared, now],
  );

  const heroRef = useCallback((element: HTMLElement | null) => {
    if (element === null) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry !== undefined) setHeroVisible(entry.isIntersecting);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    document.title = "Take-home pay · Almanac";
    return () => {
      document.title = "Almanac";
    };
  }, []);

  const header = (
    <PageHeader
      title="Take-home pay"
      actions={
        inputs !== null && (
          <PresetsButton
            inputs={inputs}
            presets={presets}
            activeId={ui.activePresetId}
            compareId={ui.comparePresetId}
            loadError={presetsError}
            reload={reloadPresets}
            onLoad={(preset) => {
              replaceState(preset.state);
              setUi({ activePresetId: preset.id });
            }}
            onActiveChange={(id) => {
              setUi({ activePresetId: id });
            }}
            onCompareChange={(id) => {
              setUi({ comparePresetId: id });
            }}
          />
        )
      }
    />
  );

  if (inputs === null || calculation === null) {
    return (
      <main className="page">
        {header}
        {status.kind === "unavailable" ? (
          <Callout severity="error" title="Couldn't reach the laptop">
            <p>Your figures will show here once it's reachable. ({status.message})</p>
            <button type="button" className="button" onClick={retry}>
              Try again
            </button>
          </Callout>
        ) : (
          <p className="empty" aria-busy>
            Loading…
          </p>
        )}
      </main>
    );
  }

  const result = calculation.kind === "done" ? calculation.result : null;
  const ok = result?.status === "ok" ? result : null;
  const issues = result?.status === "invalid" ? result.issues : [];
  const currentYear = currentTaxYear(now);

  return (
    <main className="page take-home">
      {header}
      {ok !== null && <StickySummary result={ok} visible={!heroVisible} />}
      <div className="calc-layout">
        <div className="calc-hero" ref={heroRef}>
          {ok !== null && <Summary result={ok} />}
        </div>
        <div className="calc-inputs">
          <Inputs
            inputs={inputs}
            update={setState}
            issues={issues}
            moreOpen={ui.moreOpen}
            onMoreOpenChange={(moreOpen) => {
              setUi({ moreOpen });
            }}
          />
        </div>
        <div className="calc-results">
          {calculation.kind === "no-rules" && (
            <Callout
              severity="error"
              title={`No tax rules for ${taxYearLabel(calculation.taxYear)}`}
            >
              <p>Choose another tax year under more options.</p>
              {findTaxYearRules(taxYearRegistry, currentYear) !== undefined && (
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setState((i) => ({ ...i, taxYear: currentYear }));
                  }}
                >
                  Use {taxYearLabel(currentYear)}
                </button>
              )}
            </Callout>
          )}
          <Issues issues={issues} />
          {ok !== null &&
            calculation.kind === "done" &&
            compared !== null &&
            comparedCalculation?.kind === "done" &&
            (comparedCalculation.result.status === "ok" ? (
              <Compare
                current={{
                  name: "Now",
                  result: ok,
                  projection: calculation.projection,
                }}
                other={{
                  name: compared.name,
                  result: comparedCalculation.result,
                  projection: comparedCalculation.projection,
                }}
                onClose={() => {
                  setUi({ comparePresetId: null });
                }}
              />
            ) : (
              <Callout severity="warning" title={`${compared.name} can't be worked out`}>
                Load it to see what needs fixing.
              </Callout>
            ))}
          {ok !== null && (
            <>
              <Insights result={ok} />
              <div className="results-grid">
                <Breakdown result={ok} />
                <NextPound result={ok} />
              </div>
              {inputs.studentLoans.length > 0 && calculation.kind === "done" && (
                <LoanChart projection={calculation.projection} />
              )}
              <Months result={ok} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
