/** Something a tool wants to tell the user, shown in the shell's notification drawer. */
export interface Notice {
  /** Stable across calls for the same underlying issue, so a dismissal can be remembered. */
  readonly id: string;
  readonly severity: "info" | "warning" | "error";
  readonly title: string;
  readonly body: string;
}
