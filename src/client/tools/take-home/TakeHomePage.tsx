import { Check, GitCompareArrows, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TakeHomeInputs } from "../../../shared/take-home/inputs.ts";
import type { TakeHomeCalculation } from "../../../shared/take-home/result.ts";
import { findTaxYearRules, taxYearRegistry } from "../../../shared/take-home/rules/registry.ts";
import { PageHeader } from "../../shell/PageHeader.tsx";
import { InvalidFieldsContext, useInvalidFields } from "../../ui/invalid-fields.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { Compare } from "./Compare.tsx";
import { currentTaxYear } from "./defaults.ts";
import { taxYearLabel } from "./format.ts";
import { type Baseline, Inputs } from "./Inputs.tsx";
import { LoanChart } from "./LoanChart.tsx";
import { NotLoaded } from "./NotLoaded.tsx";
import { PresetsButton, sameInputs } from "./Presets.tsx";
import {
  Breakdown,
  Callout,
  type EditChange,
  type Freshness,
  Insights,
  Issues,
  Months,
  NextThousand,
  StickySummary,
  Summary,
} from "./Results.tsx";
import { NOW, type ScenarioId, scenarioOf, useTakeHome } from "./context.tsx";

const WHAT_IF = "What if";

/** How long the change an edit made stays on show after leaving the field. */
const CHANGE_LINGER_MS = 6000;

/** Where an edit started: the figures when a field was picked, to show what editing it changes. */
interface EditStart {
  scenario: ScenarioId;
  inputs: TakeHomeInputs;
  result: TakeHomeCalculation;
}

/** Keeps where the current edit started, and for a little while after leaving the field. */
function useEditStart() {
  const [start, setStart] = useState<EditStart | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  return {
    start,
    begin: (next: EditStart | null) => {
      cancel();
      setStart(next);
    },
    end: () => {
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        setStart(null);
      }, CHANGE_LINGER_MS);
    },
  };
}

export function TakeHomePage() {
  const tool = useTakeHome();
  const { state, setState, ui, setUi, editing, nowCalculation, whatIfCalculation, now } = tool;
  const [heroVisible, setHeroVisible] = useState(true);
  const invalidFields = useInvalidFields();
  const edit = useEditStart();

  /** Watches the main figure, so the pinned summary shows once it's scrolled out of view. */
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

  const editChange: EditChange | null =
    ok !== null &&
    edit.start !== null &&
    edit.start.scenario === editing &&
    !sameInputs(edit.start.inputs, editedInputs)
      ? {
          month: ok.normalMonth.netPay - edit.start.result.normalMonth.netPay,
          year: ok.annual.netPay - edit.start.result.annual.netPay,
        }
      : null;
  const freshness: Freshness =
    invalidFields.labels.length > 0
      ? { kind: "stale", fields: invalidFields.labels }
      : { kind: "current", change: editChange };
  const stale = freshness.kind === "stale" ? " stale" : "";

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
      {ok !== null && <StickySummary result={ok} visible={!heroVisible} freshness={freshness} />}
      <div className="calc-layout">
        <div className="calc-hero">
          {ok !== null && (
            <Summary
              result={ok}
              scenarioName={editedName}
              freshness={freshness}
              figureRef={heroRef}
            />
          )}
          {nowScenario !== null && whatIfScenario !== null && (
            <div className={`stale-dims${stale}`}>
              <Compare now={nowScenario} whatIf={whatIfScenario} />
            </div>
          )}
        </div>
        <div
          className="calc-inputs"
          onFocus={(e) => {
            const field = e.target;
            if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) return;
            edit.begin(
              ok === null ? null : { scenario: editing, inputs: editedInputs, result: ok },
            );
          }}
          onBlur={(e) => {
            const field = e.target;
            if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) edit.end();
          }}
        >
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
          <InvalidFieldsContext value={invalidFields.report}>
            <Inputs
              inputs={editedInputs}
              update={update}
              issues={issues}
              baseline={baseline}
              scenarioName={editedName}
            />
          </InvalidFieldsContext>
        </div>
        <div className={`calc-results stale-dims${stale}`}>
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
