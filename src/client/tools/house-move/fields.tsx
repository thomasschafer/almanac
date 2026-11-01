import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { month } from "../../../shared/house-move/months.ts";
import { NumberInput } from "../../ui/NumberInput.tsx";
import { useReportInvalid } from "../../ui/invalid-fields.tsx";
import type { FieldOptions } from "../../ui/Fields.tsx";

const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, index, 1)),
  ),
);

/** A native select and numeric year work on Safari without relying on a native month input. */
export function MonthField({ label, value, onChange, problem, error, hint }: FieldOptions<string>) {
  const id = useId();
  const context = label.replace(/ month$/, "");
  const [draftMonth, setDraftMonth] = useState<string | null>(null);
  const selected = draftMonth ?? value.slice(5);
  const issue =
    error ??
    (draftMonth === null
      ? undefined
      : (problem?.(`${value.slice(0, 4)}-${selected}`) ?? undefined));
  useReportInvalid(id, label, issue !== undefined);
  return (
    <fieldset className="move-month">
      <legend>{label}</legend>
      <div className="field-row">
        <div className="field">
          <label htmlFor={id}>Month</label>
          <div className={`input select${issue === undefined ? "" : " input-invalid"}`}>
            <select
              id={id}
              aria-label={`${context} month`}
              value={selected}
              aria-invalid={issue !== undefined}
              aria-describedby={
                issue !== undefined || hint !== undefined ? `${id}-hint` : undefined
              }
              onChange={(event) => {
                const next = event.target.value;
                setDraftMonth(next);
                const candidate = `${value.slice(0, 4)}-${next}`;
                if (problem?.(candidate) == null) onChange(candidate);
              }}
              onBlur={() => {
                setDraftMonth(null);
              }}
            >
              {monthNames.map((name, index) => (
                <option key={name} value={String(index + 1).padStart(2, "0")}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden />
          </div>
        </div>
        <NumberInput
          label={`${context} year`}
          visibleLabel="Year"
          value={Number(value.slice(0, 4))}
          decimals={false}
          format={{
            parse: (text) =>
              /^\d{4}$/.test(text) && Number(text) >= 1 && Number(text) <= 9999
                ? Number(text)
                : null,
            format: (year) => String(year).padStart(4, "0"),
            negative: false,
            expects: "Enter a four-digit year from 0001 to 9999",
          }}
          problem={(year) => {
            const candidate = `${String(year).padStart(4, "0")}-${value.slice(5)}`;
            if (!month.safeParse(candidate).success) return "Enter a real month and year";
            return candidate === value ? null : (problem?.(candidate) ?? null);
          }}
          onChange={(year) => {
            onChange(`${String(year).padStart(4, "0")}-${value.slice(5)}`);
          }}
        />
      </div>
      {(issue ?? hint) !== undefined && (
        <p id={`${id}-hint`} className={issue === undefined ? "field-hint" : "form-error"}>
          {issue ?? hint}
        </p>
      )}
    </fieldset>
  );
}

export function EditableRow({
  title,
  summary,
  timing,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  timing?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="move-edit-row">
      <button
        type="button"
        className="move-row-toggle"
        aria-label={`Edit ${title}`}
        aria-describedby={`${id}-summary`}
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <span className="move-row-copy">
          <span className="move-row-name">{title}</span>
          <span className="move-row-meta" id={`${id}-summary`}>
            <span className="num">{summary}</span>
            {timing !== undefined && <> · {timing}</>}
          </span>
        </span>
        <ChevronDown
          size={16}
          className={open ? "move-row-chevron open" : "move-row-chevron"}
          aria-hidden
        />
      </button>
      <div id={id} hidden={!open}>
        {open && <div className="move-row-editor">{children}</div>}
      </div>
    </div>
  );
}
