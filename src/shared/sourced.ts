/**
 * Confirmed values are published or legislated for the year. Provisional ones are expected but not
 * yet confirmed, such as a figure carried forward from the previous year.
 */
export type RuleStatus = "confirmed" | "provisional";

/** A rule value with where it came from. */
export interface Sourced<T> {
  readonly value: T;
  readonly status: RuleStatus;
  /** The URL the value was checked against. */
  readonly source: string;
  /** Why a value is provisional, or anything else a reviewer should know. */
  readonly note?: string;
}

export function confirmed<T>(value: T, source: string, note?: string): Sourced<T> {
  return note === undefined
    ? { value, status: "confirmed", source }
    : { value, status: "confirmed", source, note };
}

/** A provisional value always says why it's provisional. */
export function provisional<T>(value: T, source: string, note: string): Sourced<T> {
  return { value, status: "provisional", source, note };
}

/** Carries a value forward to a later year as provisional, keeping its source. */
export function carriedForward<T>(previous: Sourced<T>, fromYear: string): Sourced<T> {
  return provisional(
    previous.value,
    previous.source,
    `Not yet published: carried forward from ${fromYear}.`,
  );
}

/** Confirms a previous year's value for a later year, where it's known not to have changed. */
export function unchanged<T>(
  previous: Sourced<T>,
  note: string,
  source: string = previous.source,
): Sourced<T> {
  return confirmed(previous.value, source, note);
}
