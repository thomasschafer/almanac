import type { ReactNode } from "react";
import { z } from "zod";
import { asPence, type Pence } from "../../shared/money.ts";
import { percent, signedPercent, type Rate, type SignedRate } from "../../shared/rates.ts";
import { NumberInput, percentFormat, poundsFormat, type Format } from "./NumberInput.tsx";

export interface FieldOptions<T> {
  label: string;
  visibleLabel?: string | undefined;
  value: T;
  onChange: (value: T) => void;
  problem?: ((value: T) => string | null) | undefined;
  error?: string | undefined;
  hint?: string | undefined;
}

export function MoneyField(props: FieldOptions<Pence>) {
  return <NumberInput {...props} format={poundsFormat} prefix="£" emptyValue={asPence(0)} />;
}

export function RateField<T extends Rate | SignedRate>({
  value,
  onChange,
  problem,
  signed = false,
  max = 20,
  ...props
}: FieldOptions<T> & { signed?: boolean; max?: number }) {
  const format = percentFormat({ min: signed ? -20 : 0, max });
  const convert = signed ? signedPercent : percent;
  const rateFormat: Format<T> = {
    ...format,
    parse: (text) => {
      const n = format.parse(text);
      if (n === null || Math.abs(n * 100 - Math.round(n * 100)) > 1e-9) return null;
      return convert(n) as T;
    },
    format: (rate) => format.format(rate / 100),
    expects: `${format.expects}, with at most two decimal places`,
  };
  return (
    <NumberInput
      {...props}
      value={value}
      onChange={onChange}
      problem={problem}
      format={rateFormat}
      suffix="%"
      emptyValue={convert(0) as T}
    />
  );
}

export function CountField({
  min = 0,
  max = 600,
  suffix,
  ...props
}: FieldOptions<number> & { min?: number; max?: number; suffix?: string }) {
  return (
    <NumberInput
      {...props}
      suffix={suffix}
      decimals={false}
      emptyValue={min}
      format={{
        parse: (text) =>
          /^\d+$/.test(text) && Number(text) >= min && Number(text) <= max ? Number(text) : null,
        format: String,
        negative: false,
        expects: `Enter a whole number from ${min} to ${max}`,
      }}
    />
  );
}

export function TextField({
  schema = z.string().trim().min(1),
  ...props
}: FieldOptions<string> & { schema?: z.ZodType<string> }) {
  return (
    <NumberInput
      {...props}
      numeric={false}
      format={{
        parse: (text) => {
          const result = schema.safeParse(text);
          return result.success ? result.data : null;
        },
        format: String,
        negative: false,
        expects: "Enter a non-empty value",
      }}
    />
  );
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="move-group">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
