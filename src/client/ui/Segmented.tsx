import { useId } from "react";

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <span id={id} className={hideLabel ? "visually-hidden" : "field-label"}>
        {label}
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby={id}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            className={option.value === value ? "on" : undefined}
            onClick={() => {
              onChange(option.value);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Several options, any number of which can be on. */
export function Chips<T extends string>({
  label,
  selected,
  options,
  onToggle,
  hint,
}: {
  label: string;
  selected: readonly T[];
  options: readonly { value: T; label: string }[];
  onToggle: (value: T, on: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <span id={id} className="field-label">
        {label}
      </span>
      <div className="chips" role="group" aria-labelledby={id}>
        {options.map((option) => {
          const on = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              className={on ? "chip on" : "chip"}
              onClick={() => {
                onToggle(option.value, !on);
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {hint !== undefined && <p className="field-hint">{hint}</p>}
    </div>
  );
}
