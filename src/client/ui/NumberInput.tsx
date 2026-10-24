import { type ReactNode, useId, useState } from "react";
import { asPence, type Pence } from "../../shared/money.ts";

interface Format<T> {
  /** Turns typed text into a value, or null if it isn't one (yet). */
  parse: (text: string) => T | null;
  format: (value: T) => string;
}

const grouped = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

function cleanNumber(text: string): number | null {
  const cleaned = text.replace(/[£,\s%]/g, "");
  if (cleaned === "" || !/^\d*\.?\d*$/.test(cleaned) || cleaned === ".") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export const poundsFormat: Format<Pence> = {
  parse: (text) => {
    const pounds = cleanNumber(text);
    if (pounds === null || pounds > 100_000_000) return null;
    return asPence(Math.round(pounds * 100));
  },
  format: (pence) => grouped.format(pence / 100),
};

export function percentFormat(max: number): Format<number> {
  return {
    parse: (text) => {
      const value = cleanNumber(text);
      return value === null || value > max ? null : value;
    },
    format: (value) => grouped.format(value),
  };
}

export const yearFormat: Format<number> = {
  parse: (text) => {
    const value = Number(text.trim());
    return /^\d{4}$/.test(text.trim()) && value >= 1990 && value <= 2100 ? value : null;
  },
  format: (value) => String(value),
};

/** What clearing the field means. */
type Empty<T> =
  /** It must be filled in: an empty field is invalid and reports nothing. */
  | { nullable?: false; emptyValue?: undefined; onChange: (value: T) => void }
  /** An empty field is this value. */
  | { nullable?: false; emptyValue: T; onChange: (value: T) => void }
  /** An empty field means there's no value, such as one that isn't known. */
  | { nullable: true; emptyValue?: undefined; onChange: (value: T | null) => void };

/** What a draft means: a value, no value (when the field is nullable), or nothing valid yet. */
type Parsed<T> = { kind: "value"; value: T } | { kind: "null" } | { kind: "invalid" };

function parseDraft<T>(text: string, format: Format<T>, empty: Empty<T>): Parsed<T> {
  if (text.trim() === "") {
    if (empty.nullable === true) return { kind: "null" };
    return empty.emptyValue === undefined
      ? { kind: "invalid" }
      : { kind: "value", value: empty.emptyValue };
  }
  const value = format.parse(text);
  return value === null ? { kind: "invalid" } : { kind: "value", value };
}

/**
 * A numeric text field that keeps whatever is typed while it has focus, only reporting values
 * that parse, and tidies the text when it loses focus.
 */
export function NumberInput<T>({
  label,
  value,
  format,
  prefix,
  suffix,
  hint,
  placeholder,
  decimals = true,
  trailing,
  labelAccessory,
  ...empty
}: {
  label: string;
  value: T | null;
  format: Format<T>;
  prefix?: string | undefined;
  suffix?: string | undefined;
  hint?: string | undefined;
  placeholder?: string | undefined;
  decimals?: boolean;
  /** A control at the end of the field, such as a unit toggle. */
  trailing?: ReactNode;
  /** A control beside the label, such as a picker that changes what the field means. */
  labelAccessory?: ReactNode;
} & Empty<T>) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? "" : format.format(value));
  const invalid = draft !== null && parseDraft(draft, format, empty).kind === "invalid";

  return (
    <div className="field">
      {labelAccessory === undefined ? (
        <label htmlFor={id}>{label}</label>
      ) : (
        <div className="field-label-row">
          <label htmlFor={id}>{label}</label>
          {labelAccessory}
        </div>
      )}
      <div className={`input${invalid ? " input-invalid" : ""}`}>
        {prefix !== undefined && <span className="input-affix">{prefix}</span>}
        <input
          id={id}
          className="num"
          inputMode={decimals ? "decimal" : "numeric"}
          autoComplete="off"
          enterKeyHint="done"
          placeholder={placeholder}
          value={shown}
          aria-invalid={invalid}
          aria-describedby={hint === undefined ? undefined : `${id}-hint`}
          onFocus={(e) => {
            setDraft(shown);
            e.currentTarget.select();
          }}
          onChange={(e) => {
            const text = e.currentTarget.value;
            setDraft(text);
            const next = parseDraft(text, format, empty);
            if (next.kind === "value") empty.onChange(next.value);
            else if (next.kind === "null" && empty.nullable === true) empty.onChange(null);
          }}
          onBlur={() => {
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        {suffix !== undefined && <span className="input-affix">{suffix}</span>}
        {trailing}
      </div>
      {hint !== undefined && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
