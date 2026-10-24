/** Something a tool wants to tell the user, shown in the shell's notification drawer. */
export type Notice = {
  /** Stable across calls for the same underlying issue, so a dismissal can be remembered. */
  readonly id: string;
  readonly title: string;
  readonly body: string;
} & (
  | { readonly severity: "info" | "warning"; readonly dismissible: boolean }
  /** Errors can't be dismissed: they stay until whatever caused them is fixed. */
  | { readonly severity: "error"; readonly dismissible: false }
);
