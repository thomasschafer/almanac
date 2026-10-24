import { useTakeHome } from "./context.tsx";
import { Callout } from "./Results.tsx";

/** What a page shows before the figures are loaded: that they're loading, or why they can't be. */
export function NotLoaded() {
  const { status, retry } = useTakeHome();
  return status.kind === "unavailable" ? (
    <Callout severity="error" title="Couldn't reach the laptop">
      <p>Your figures will show here once it's reachable. ({status.message})</p>
      <button type="button" className="button" onClick={retry}>
        Try again
      </button>
    </Callout>
  ) : (
    <p className="empty" aria-busy>
      Loading…
    </p>
  );
}
