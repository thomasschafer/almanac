import { Component, type ErrorInfo, type ReactNode } from "react";
import { Callout } from "../ui/Callout.tsx";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Shows what went wrong when a page fails to render, instead of leaving it blank. The fallback
 * only uses plain markup, as anything shared, such as the page header, may be what failed.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: { message: string } | null }
> {
  override state: { error: { message: string } | null } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: { message: string } } {
    return { error: { message: messageOf(error) } };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("a page failed to render", error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    return (
      <main className="page">
        <header className="page-header">
          <div className="page-title">
            <h1>Something went wrong</h1>
          </div>
        </header>
        <Callout severity="error" title="This page couldn't be shown">
          <p>{error.message}</p>
          <p>
            Reloading may fix it; if not, it's a bug in the app. <a href="/">Back to Almanac</a>
          </p>
          <button
            type="button"
            className="button"
            onClick={() => {
              window.location.reload();
            }}
          >
            Reload
          </button>
        </Callout>
      </main>
    );
  }
}
