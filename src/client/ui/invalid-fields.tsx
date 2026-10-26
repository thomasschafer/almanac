import { createContext, useCallback, useContext, useEffect, useState } from "react";

/** Reports a field's label while what's typed in it isn't a valid value, or null once it is. */
type Report = (id: string, label: string | null) => void;

/**
 * Where fields report text that isn't a valid value. While they do, anything worked out from
 * them still reflects their last valid value, so it has to say so rather than look current.
 */
export const InvalidFieldsContext = createContext<Report | null>(null);

/** The labels of the fields that currently hold text that isn't a valid value. */
export function useInvalidFields(): { labels: readonly string[]; report: Report } {
  const [fields, setFields] = useState<ReadonlyMap<string, string>>(new Map());
  const report = useCallback<Report>((id, label) => {
    setFields((current) => {
      if (current.get(id) === (label ?? undefined)) return current;
      const next = new Map(current);
      if (label === null) next.delete(id);
      else next.set(id, label);
      return next;
    });
  }, []);
  return { labels: [...fields.values()], report };
}

/** Tells the page whether this field holds text that isn't a valid value. */
export function useReportInvalid(id: string, label: string, invalid: boolean): void {
  const report = useContext(InvalidFieldsContext);
  if (report === null) {
    throw new Error("a field that can hold invalid text must be inside InvalidFieldsContext");
  }
  useEffect(() => {
    report(id, invalid ? label : null);
  }, [report, id, label, invalid]);
  useEffect(
    () => () => {
      report(id, null);
    },
    [report, id],
  );
}
