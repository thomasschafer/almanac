import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { type ToolId, type ToolState, toolSchemas } from "../../shared/tools.ts";
import { getState, putState } from "../api.ts";
import { readLocal, writeLocal } from "../local-store.ts";

const SAVE_DELAY_MS = 600;
const RETRY_DELAY_MS = 5000;

export type SyncStatus =
  /** Nothing to show yet: no copy on this device, and the server hasn't answered. */
  | { kind: "loading" }
  /** The server couldn't be reached and there's no copy on this device. */
  | { kind: "unavailable"; message: string }
  | { kind: "saved" }
  | { kind: "saving" }
  /** Edits are kept on this device and will be saved when the server can be reached. */
  | { kind: "unsaved"; message: string };

function cacheSchema(tool: ToolId) {
  return z.object({ state: toolSchemas[tool].state, dirty: z.boolean() });
}

function cacheKey(tool: ToolId): string {
  return `almanac:state:${tool}`;
}

/**
 * A tool's state, shared across devices through the server. Edits apply at once, are kept on
 * this device so nothing is lost offline, and are saved shortly after they stop. While there are
 * no unsaved edits, the server's copy wins, so returning to the app shows the latest state from
 * whichever device last changed it.
 */
export function useToolState<T extends ToolId>(
  tool: T,
  defaults: () => ToolState<T>,
): {
  state: ToolState<T> | null;
  setState: (update: (current: ToolState<T>) => ToolState<T>) => void;
  replaceState: (next: ToolState<T>) => void;
  status: SyncStatus;
  retry: () => void;
} {
  const [cached] = useState(
    () =>
      readLocal(cacheKey(tool), cacheSchema(tool)) as {
        state: ToolState<T>;
        dirty: boolean;
      } | null,
  );
  const [state, setLocalState] = useState<ToolState<T> | null>(() => cached?.state ?? null);
  const [status, setStatus] = useState<SyncStatus>(
    cached === null
      ? { kind: "loading" }
      : cached.dirty
        ? { kind: "unsaved", message: "Not saved yet" }
        : { kind: "saved" },
  );
  const latest = useRef<{ state: ToolState<T> | null; dirty: boolean; version: number }>({
    state: state,
    dirty: cached?.dirty ?? false,
    version: 0,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  const remember = useCallback(
    (next: ToolState<T>, dirty: boolean) => {
      latest.current = { state: next, dirty, version: latest.current.version + (dirty ? 1 : 0) };
      writeLocal(cacheKey(tool), { state: next, dirty });
    },
    [tool],
  );

  const save = useCallback(async () => {
    const { state: toSave, dirty, version } = latest.current;
    if (!dirty || toSave === null) return;
    setStatus({ kind: "saving" });
    try {
      await putState(tool, toSave);
      if (latest.current.version === version) {
        remember(toSave, false);
        setStatus({ kind: "saved" });
      }
    } catch (error) {
      setStatus({ kind: "unsaved", message: errorMessage(error) });
      schedule(RETRY_DELAY_MS);
    }
  }, [tool, remember]);

  function schedule(delay: number): void {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void saveRef.current();
    }, delay);
  }

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const hasUnsavedEdits = () => latest.current.dirty;

  const load = useCallback(async () => {
    if (latest.current.dirty) {
      void save();
      return;
    }
    try {
      const saved = await getState(tool);
      // An edit made while the request was in flight wins over what the server had.
      if (hasUnsavedEdits()) return;
      const next = saved?.state ?? latest.current.state ?? defaultsRef.current();
      remember(next, false);
      setLocalState(next);
      setStatus({ kind: "saved" });
    } catch (error) {
      if (latest.current.state === null) {
        setStatus({ kind: "unavailable", message: errorMessage(error) });
      } else {
        setStatus({ kind: "unsaved", message: errorMessage(error) });
      }
    }
  }, [tool, save, remember]);

  useEffect(() => {
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onOnline = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [load]);

  const replaceState = useCallback(
    (next: ToolState<T>) => {
      remember(next, true);
      setLocalState(next);
      schedule(SAVE_DELAY_MS);
    },
    // schedule only touches refs.

    [remember],
  );

  const setState = useCallback(
    (update: (current: ToolState<T>) => ToolState<T>) => {
      const current = latest.current.state;
      if (current === null) throw new Error(`${tool} state was edited before it loaded`);
      replaceState(update(current));
    },
    [tool, replaceState],
  );

  const retry = useCallback(() => void load(), [load]);

  return { state, setState, replaceState, status, retry };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
