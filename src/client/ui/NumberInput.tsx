import { type ReactNode, useId, useState } from "react";
import type { z } from "zod";
import { asPence, type Pence } from "../../shared/money.ts";
import { useReportInvalid } from "./invalid-fields.tsx";

interface Format<T> {
  /** Turns typed text into a value, or null if it isn't one (yet). */
  parse: (text: string) => T | null;
  format: (value: T) => string;
  /** Whether it takes values below 0, which need a keyboard with a minus sign. */
  negative: boolean;
  /** What it takes, shown while the text isn't one. */
  expects: string;
}

const grouped = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

const MAX_POUNDS = 100_000_000;

/** Reads a typed number, ignoring currency, grouping and percent signs. */
function cleanNumber(text: string, { negative }: { negative: boolean }): number | null {
  // Phones can type a minus sign as the Unicode one.
  const cleaned = text.replace(/[£,\s%]/g, "").replace(/^\u2212/, "-");
  const pattern = negative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  if (!pattern.test(cleaned) || !/\d/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export const poundsFormat: Format<Pence> = {
  parse: (text) => {
    const pounds = cleanNumber(text, { negative: false });
    if (pounds === null || pounds > MAX_POUNDS) return null;
    return asPence(Math.round(pounds * 100));
  },
  format: (pence) => grouped.format(pence / 100),
  negative: false,
  expects: `Enter an amount in pounds, up to £${grouped.format(MAX_POUNDS)}`,
};

export interface Bounds {
  readonly min: number;
  readonly max: number;
}

/** The bounds a schema puts on a number, so a field takes exactly what the schema accepts. */
export function boundsOf(schema: z.ZodNumber): Bounds {
  const { minValue: min, maxValue: max } = schema;
  if (min === null || max === null || !Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error("a number field needs a schema with a minimum and a maximum");
  }
  return { min, max };
}

export function percentFormat({ min, max }: Bounds): Format<number> {
  if (min > max) throw new Error(`percentages can't run from ${String(min)} to ${String(max)}`);
  const negative = min < 0;
  return {
    parse: (text) => {
      const value = cleanNumber(text, { negative });
      return value === null || value < min || value > max ? null : value;
    },
    format: (value) => grouped.format(value),
    negative,
    expects: `Enter a percentage from ${grouped.format(min)} to ${grouped.format(max)}`,
  };
}

const YEARS = { min: 1990, max: 2100 } as const;

export const yearFormat: Format<number> = {
  parse: (text) => {
    const value = Number(text.trim());
    return /^\d{4}$/.test(text.trim()) && value >= YEARS.min && value <= YEARS.max ? value : null;
  },
  format: (value) => String(value),
  negative: false,
  expects: `Enter a year from ${String(YEARS.min)} to ${String(YEARS.max)}`,
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
 * that parse, and tidies the text when it loses focus. While the text isn't a valid value it
 * says what it takes, and tells the page, whose results still reflect the last valid value.
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
  useReportInvalid(id, label, invalid);
  const shownHint = invalid ? format.expects : hint;

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
          // Phones' number pads have no minus sign, so fields that take one get a full keyboard.
          inputMode={format.negative ? "text" : decimals ? "decimal" : "numeric"}
          autoComplete="off"
          enterKeyHint="done"
          placeholder={placeholder}
          value={shown}
          aria-invalid={invalid}
          aria-describedby={shownHint === undefined ? undefined : `${id}-hint`}
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
      {shownHint !== undefined && (
        <p id={`${id}-hint`} className="field-hint">
          {shownHint}
        </p>
      )}
    </div>
  );
}
