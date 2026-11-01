// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { defaultHouseMoveInputs } from "../../../shared/house-move/defaults.ts";
import { calculateHouseMove } from "../../../shared/house-move/engine.ts";
import type { HouseMoveInputs } from "../../../shared/house-move/inputs.ts";
import { fromPounds } from "../../../shared/money.ts";
import { percent } from "../../../shared/rates.ts";
import { Breakdown } from "./Results.tsx";

function show(inputs: HouseMoveInputs) {
  const row = calculateHouseMove(inputs, "2026-11").breakdown;
  if (row === null) throw new Error("Expected an affordable result");
  return render(
    <Breakdown
      row={row}
      region={inputs.region}
      asOf={inputs.asOf}
      mortgage={inputs.mortgage}
      deposit={inputs.deposit}
    />,
  );
}

afterEach(cleanup);

describe("relevant breakdown amounts", () => {
  it("hides repeated real-money amounts and fees that are not configured", () => {
    const { container } = show(defaultHouseMoveInputs("2026-11"));
    expect(container.querySelectorAll(".move-real")).toHaveLength(0);
    expect(screen.queryByText("Early repayment charge")).toBeNull();
    expect(screen.queryByText("Exit fee")).toBeNull();
  });

  it("retains configured fees, including an ERC that has expired", () => {
    const inputs = defaultHouseMoveInputs("2026-11");
    inputs.mortgage.ercBands = [{ until: "2026-10", rate: percent(1) }];
    inputs.mortgage.exitFee = fromPounds(100);
    show(inputs);
    expect(screen.getByText("Early repayment charge").closest(".move-line")?.textContent).toContain(
      "−£0",
    );
    expect(screen.getByText("Exit fee").closest(".move-line")?.textContent).toContain("−£100");
  });

  it("still shows today's-money equivalents for a future result", () => {
    const inputs = defaultHouseMoveInputs("2026-11");
    inputs.homeValue = fromPounds(200_000);
    const { container } = show(inputs);
    expect(container.querySelectorAll(".move-real").length).toBeGreaterThan(0);
    const savings = screen.getByText("Savings available").parentElement;
    expect(savings?.querySelector(".move-real")).toBeNull();
  });
});
