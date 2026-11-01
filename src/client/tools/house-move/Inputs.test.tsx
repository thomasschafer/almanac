// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultHouseMoveInputs } from "../../../shared/house-move/defaults.ts";
import { InvalidFieldsContext, useInvalidFields } from "../../ui/invalid-fields.tsx";
import { Inputs } from "./Inputs.tsx";

function Example() {
  const [inputs, setInputs] = useState(() => defaultHouseMoveInputs("2026-11"));
  const invalid = useInvalidFields();
  return (
    <InvalidFieldsContext value={invalid.report}>
      <Inputs inputs={inputs} update={setInputs} today="2026-11" />
      <output aria-label="Current value">{inputs.homeValue}</output>
      <output aria-label="Invalid fields">{invalid.labels.join(", ")}</output>
    </InvalidFieldsContext>
  );
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

afterEach(cleanup);

describe("house-move fields", () => {
  it("updates valid keystrokes and restores the last valid value after invalid input", () => {
    render(<Example />);
    const field = screen.getByLabelText("Current home value");
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "200000" } });
    expect(screen.getByLabelText("Current value").textContent).toBe("20000000");
    fireEvent.change(field, { target: { value: "wrong" } });
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Invalid fields").textContent).toContain("Current home value");
    fireEvent.blur(field);
    expect((field as HTMLInputElement).value).toBe("200,000");
    expect(screen.getByLabelText("Invalid fields").textContent).toBe("");
  });

  it("marks a payment override below interest invalid and restores it on blur", () => {
    render(<Example />);
    fireEvent.click(screen.getByRole("button", { name: /More options/ }));
    const payment = screen.getByLabelText("Monthly payment override");
    fireEvent.focus(payment);
    fireEvent.change(payment, { target: { value: "1" } });
    expect(payment.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/must cover interest/).textContent).toContain("£562.50");
    fireEvent.blur(payment);
    expect((payment as HTMLInputElement).value).toBe("");
  });

  it("converts the deposit without losing its value and edits costs", () => {
    render(<Example />);
    fireEvent.click(screen.getByRole("radio", { name: "£ amount" }));
    expect(screen.getByLabelText<HTMLInputElement>("Deposit").value).toBe("112,500");
    fireEvent.click(screen.getByRole("radio", { name: "% of price" }));
    expect(screen.getByLabelText<HTMLInputElement>("Deposit").value).toBe("25");
    fireEvent.click(screen.getByRole("button", { name: /More options/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add cost" }));
    expect(screen.getByRole("button", { name: "Remove New cost" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove New cost" }));
    expect(screen.queryByRole("button", { name: "Remove New cost" })).toBeNull();
  });

  it("shows compact cost summaries and opens only the selected cost", () => {
    render(<Example />);
    fireEvent.click(screen.getByRole("button", { name: /More options/ }));
    const agent = screen.getByRole("button", { name: "Edit Estate agent" });
    expect(agent.textContent).toContain("1.25% of sale + VAT · at completion");
    expect(agent.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("Estate agent name")).toBeNull();
    fireEvent.click(agent);
    expect(screen.getByLabelText("Estate agent name")).toBeTruthy();
    expect(screen.getByLabelText("Estate agent rate")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Estate agent plus VAT" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Estate agent paid" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit Conveyancing (sale)" }));
    expect(screen.queryByLabelText("Estate agent name")).toBeNull();
    expect(screen.getByLabelText("Conveyancing (sale) amount")).toBeTruthy();
  });

  it("uses named months, rejects a future as-of month and restores the selection on blur", () => {
    render(<Example />);
    fireEvent.click(screen.getByRole("button", { name: /More options/ }));
    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "Figures as of month" });
    expect(select.selectedOptions[0]?.textContent).toBe("November");
    fireEvent.change(select, { target: { value: "12" } });
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Invalid fields").textContent).toContain("Figures as of");
    fireEvent.blur(select);
    expect(select.value).toBe("11");
    expect(screen.getByLabelText("Invalid fields").textContent).toBe("");
    const year = screen.getByLabelText<HTMLInputElement>("Figures as of year");
    fireEvent.focus(year);
    fireEvent.change(year, { target: { value: "2027" } });
    expect(year.getAttribute("aria-invalid")).toBe("true");
    fireEvent.blur(year);
    expect(year.value).toBe("2026");
    fireEvent.change(select, { target: { value: "10" } });
    fireEvent.blur(select);
    expect(select.selectedOptions[0]?.textContent).toBe("October");
  });

  it("opens new ERC and overpayment rows with month and year controls", () => {
    render(<Example />);
    fireEvent.click(screen.getByRole("button", { name: /More options/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add ERC band" }));
    expect(screen.getByRole("button", { name: "Edit ERC band 1" }).textContent).toContain(
      "November 2027",
    );
    expect(screen.getByRole("combobox", { name: "ERC band 1 through month" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add one-off overpayment" }));
    expect(
      screen.getByRole("button", { name: "Edit ERC band 1" }).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.getByRole("button", { name: "Edit Overpayment 1" }).textContent).toContain(
      "December 2026",
    );
    expect(screen.getByRole("combobox", { name: "Overpayment 1 month" })).toBeTruthy();
  });
});
