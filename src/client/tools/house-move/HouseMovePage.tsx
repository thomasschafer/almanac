import { CalculatorLayout } from "../../ui/CalculatorLayout.tsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { defaultHouseMoveInputs } from "../../../shared/house-move/defaults.ts";
import { calculateHouseMove } from "../../../shared/house-move/engine.ts";
import { houseMoveInputProblems } from "../../../shared/house-move/problems.ts";
import { ukDate } from "../../../shared/rule-review.ts";
import { readLocal, writeLocal } from "../../local-store.ts";
import { PageHeader } from "../../shell/PageHeader.tsx";
import { useToolState } from "../../state/useToolState.ts";
import { NotLoaded } from "../../ui/NotLoaded.tsx";
import { Callout } from "../../ui/Callout.tsx";
import { InvalidFieldsContext, useInvalidFields } from "../../ui/invalid-fields.tsx";
import { PresetsButton, usePresets } from "../../ui/Presets.tsx";
import { useHeroVisibility } from "../../ui/useHeroVisibility.ts";
import { useNow } from "../../ui/useNow.ts";
import { Inputs } from "./Inputs.tsx";
import { headline, Results, waitLabel } from "./Results.tsx";
import { gbp } from "./format.ts";

const ACTIVE_KEY = "almanac:house-move:active-preset";

export default function HouseMovePage() {
  const now = useNow();
  const today = ukDate(now).slice(0, 7);
  const defaults = useCallback(() => ({ inputs: defaultHouseMoveInputs(today) }), [today]);
  const tool = useToolState("house-move", defaults);
  const presets = usePresets("house-move");
  const [active, setActive] = useState(() => readLocal(ACTIVE_KEY, z.string().nullable()));
  const invalid = useInvalidFields();
  const { visible: heroVisible, ref: heroRef } = useHeroVisibility();
  const problems = useMemo(
    () => (tool.state === null ? [] : houseMoveInputProblems(tool.state.inputs, today)),
    [tool.state, today],
  );
  const calculation = useMemo(
    () =>
      tool.state === null || problems.length > 0
        ? null
        : calculateHouseMove(tool.state.inputs, today),
    [tool.state, today, problems],
  );
  useEffect(() => {
    document.title = "House move · Almanac";
    return () => {
      document.title = "Almanac";
    };
  }, []);
  const stale = invalid.labels.length > 0 || problems.length > 0;
  function select(id: string) {
    setActive(id);
    writeLocal(ACTIVE_KEY, id);
  }
  if (tool.state === null)
    return (
      <main className="page house-move">
        <PageHeader title="House move" />
        <NotLoaded status={tool.status} retry={tool.retry} />
      </main>
    );
  const state = tool.state;
  const title = calculation === null ? "Waiting for valid figures" : headline(calculation.result);
  const note =
    calculation === null
      ? "Check the highlighted inputs to calculate this move."
      : waitLabel(calculation.result);
  return (
    <main className="page house-move">
      <PageHeader
        title="House move"
        actions={
          <PresetsButton
            tool="house-move"
            inputs={state.inputs}
            presets={presets.presets}
            activeId={active}
            loadError={presets.error}
            reload={presets.reload}
            onLoad={(preset) => {
              tool.replaceState({ inputs: preset.state });
              select(preset.id);
            }}
            onSaved={(preset) => {
              select(preset.id);
            }}
          />
        }
      />
      <div
        className={`sticky-summary${!heroVisible ? " visible" : ""}${stale ? " stale" : ""}`}
        aria-hidden={heroVisible}
      >
        <span className="sticky-value num">{title}</span>
        <span className="sticky-note">{stale ? "Waiting for valid figures" : note}</span>
      </div>
      <CalculatorLayout
        stale={stale}
        busy={stale}
        hero={
          <>
            <section
              ref={heroRef}
              className={`panel summary${stale ? " stale" : ""}`}
              aria-label="Move date"
            >
              <div className="summary-main">
                <p className="kicker">When you can move</p>
                <div className="hero-figure num">{title}</div>
                <p className="summary-note">{note}</p>
                {stale && (
                  <p className="freshness stale" role="status">
                    Not updated until {invalid.labels.join(", ") || "the highlighted inputs"}{" "}
                    {invalid.labels.length === 1 ? "is" : "are"} valid
                  </p>
                )}
              </div>
              {calculation?.breakdown != null && (
                <dl className="summary-cells">
                  <div>
                    <dt>Deposit</dt>
                    <dd className="num">{gbp(calculation.breakdown.deposit)}</dd>
                  </div>
                  <div>
                    <dt>New mortgage</dt>
                    <dd className="num">{gbp(calculation.breakdown.newMortgage)}</dd>
                  </div>
                  <div>
                    <dt>Up-front cash</dt>
                    <dd className="num">{gbp(calculation.breakdown.upfrontCosts)}</dd>
                  </div>
                </dl>
              )}
            </section>
          </>
        }
        inputs={
          <>
            <InvalidFieldsContext value={invalid.report}>
              <Inputs
                inputs={state.inputs}
                update={(change) => {
                  tool.setState((current) => ({ inputs: change(current.inputs) }));
                }}
                today={today}
              />
            </InvalidFieldsContext>
          </>
        }
        results={
          <>
            {problems.length > 0 && (
              <Callout title="Check your figures" severity="warning">
                {problems.map((problem) => (
                  <p key={problem.kind}>{problem.message}</p>
                ))}
              </Callout>
            )}
            {calculation !== null && (
              <Results
                calculation={calculation}
                region={state.inputs.region}
                asOf={state.inputs.asOf}
                mortgage={state.inputs.mortgage}
                deposit={state.inputs.deposit}
              />
            )}
          </>
        }
      />
    </main>
  );
}
