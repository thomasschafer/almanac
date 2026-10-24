import { Check, GitCompareArrows, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { TakeHomeInputs } from "../../../shared/take-home/inputs.ts";
import { findTaxYearRules, taxYearRegistry } from "../../../shared/take-home/rules/registry.ts";
import { PageHeader } from "../../shell/PageHeader.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { Compare } from "./Compare.tsx";
import { currentTaxYear } from "./defaults.ts";
import { taxYearLabel } from "./format.ts";
import { type Baseline, Inputs } from "./Inputs.tsx";
import { LoanChart } from "./LoanChart.tsx";
import { NotLoaded } from "./NotLoaded.tsx";
import { PresetsButton } from "./Presets.tsx";
import {
  Breakdown,
  Callout,
  Insights,
  Issues,
  Months,
  NextThousand,
  StickySummary,
  Summary,
} from "./Results.tsx";
import { NOW, type ScenarioId, scenarioOf, useTakeHome } from "./context.tsx";

const WHAT_IF = "What if";

export function TakeHomePage() {
  const tool = useTakeHome();
  const { state, setState, ui, setUi, editing, nowCalculation, whatIfCalculation, now } = tool;
  const [heroVisible, setHeroVisible] = useState(true);

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

  if (state === null || nowCalculation === null) {
    return (
      <main className="page">
        <PageHeader title="Take-home pay" />
        <NotLoaded />
      </main>
    );
  }

  const whatIf = state.whatIf;
  const editedInputs = editing === "what-if" && whatIf !== null ? whatIf.inputs : state.inputs;
  const calculation =
    editing === "what-if" && whatIfCalculation !== null ? whatIfCalculation : nowCalculation;
  const editedName = whatIf === null ? null : editing === "now" ? NOW : whatIf.label;
  const baseline: Baseline | null =
    whatIf === null
      ? null
      : editing === "now"
        ? { name: whatIf.label, inputs: whatIf.inputs }
        : { name: NOW, inputs: state.inputs };

  const result = calculation.kind === "done" ? calculation.result : null;
  const ok = result?.status === "ok" ? result : null;
  const issues = result?.status === "invalid" ? result.issues : [];
  const currentYear = currentTaxYear(now);

  const nowScenario = scenarioOf(NOW, state.inputs, nowCalculation);
  const whatIfScenario =
    whatIf === null ? null : scenarioOf(whatIf.label, whatIf.inputs, whatIfCalculation);

  function update(change: (inputs: TakeHomeInputs) => TakeHomeInputs) {
    setState((s) =>
      editing === "what-if" && s.whatIf !== null
        ? { ...s, whatIf: { ...s.whatIf, inputs: change(s.whatIf.inputs) } }
        : { ...s, inputs: change(s.inputs) },
    );
  }

  function startWhatIf(label: string, inputs: TakeHomeInputs) {
    setState((s) => ({ ...s, whatIf: { label, inputs } }));
    setUi({ editing: "what-if" });
  }

  const activePreset =
    editing === "now"
      ? (tool.presets.presets?.find((p) => p.id === ui.activePresetId) ?? null)
      : null;

  return (
    <main className="page take-home">
      <PageHeader
        title="Take-home pay"
        actions={
          <>
            {whatIf === null && (
              <button
                type="button"
                className="header-button"
                onClick={() => {
                  startWhatIf(WHAT_IF, state.inputs);
                }}
              >
                <GitCompareArrows size={15} aria-hidden />
                <span className="header-button-label">What if…</span>
              </button>
            )}
            <PresetsButton
              inputs={editedInputs}
              presets={tool.presets.presets}
              activeId={activePreset?.id ?? null}
              loadError={tool.presets.error}
              reload={tool.presets.reload}
              onLoad={(preset) => {
                if (editing === "what-if") {
                  setState((s) => ({
                    ...s,
                    whatIf: { label: preset.name, inputs: preset.state },
                  }));
                } else {
                  setState((s) => ({ ...s, inputs: preset.state }));
                  setUi({ activePresetId: preset.id });
                }
              }}
              onSaved={(preset) => {
                if (editing === "now") setUi({ activePresetId: preset.id });
              }}
              onCompare={(preset) => {
                startWhatIf(preset.name, preset.state);
              }}
            />
          </>
        }
      />
      {ok !== null && <StickySummary result={ok} visible={!heroVisible} />}
      <div className="calc-layout">
        <div className="calc-hero" ref={heroRef}>
          {ok !== null && <Summary result={ok} scenarioName={editedName} />}
          {nowScenario !== null && whatIfScenario !== null && (
            <Compare now={nowScenario} whatIf={whatIfScenario} />
          )}
        </div>
        <div className="calc-inputs">
          {whatIf !== null && (
            <ScenarioBar
              editing={editing}
              label={whatIf.label}
              onEdit={(scenario) => {
                setUi({ editing: scenario });
              }}
              onAdopt={() => {
                setState((s) =>
                  s.whatIf === null ? s : { inputs: s.whatIf.inputs, whatIf: null },
                );
                setUi({ editing: "now", activePresetId: null });
              }}
              onEnd={() => {
                setState((s) => ({ ...s, whatIf: null }));
                setUi({ editing: "now" });
              }}
            />
          )}
          <Inputs
            inputs={editedInputs}
            update={update}
            issues={issues}
            baseline={baseline}
            scenarioName={editedName}
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
                    update((i) => ({ ...i, taxYear: currentYear }));
                  }}
                >
                  Use {taxYearLabel(currentYear)}
                </button>
              )}
            </Callout>
          )}
          <Issues issues={issues} />
          {ok !== null && calculation.kind === "done" && (
            <>
              <Insights result={ok} />
              <div className="results-grid">
                <Breakdown result={ok} />
                <NextThousand result={ok} />
              </div>
              {editedInputs.studentLoans.length > 0 && (
                <LoanChart projection={calculation.projection} detailsLink />
              )}
              <Months result={ok} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function ScenarioBar({
  editing,
  label,
  onEdit,
  onAdopt,
  onEnd,
}: {
  editing: ScenarioId;
  label: string;
  onEdit: (scenario: ScenarioId) => void;
  onAdopt: () => void;
  onEnd: () => void;
}) {
  return (
    <section className="panel scenario-bar" aria-label="Comparing">
      <Segmented
        label="Editing"
        value={editing}
        options={[
          { value: "now", label: NOW },
          { value: "what-if", label },
        ]}
        onChange={onEdit}
      />
      <div className="scenario-actions">
        <button type="button" className="text-button" onClick={onAdopt}>
          <Check size={14} aria-hidden /> Use “{label}” from now on
        </button>
        <button type="button" className="text-button quiet" onClick={onEnd}>
          <X size={14} aria-hidden /> Stop comparing
        </button>
      </div>
    </section>
  );
}
