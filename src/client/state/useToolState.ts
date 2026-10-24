import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { Notice } from "../../shared/notices.ts";
import { type ToolId, type ToolState, toolSchemas } from "../../shared/tools.ts";
import { getState, putState } from "../api.ts";
import { readLocal, writeLocal } from "../local-store.ts";

const SAVE_DELAY_MS = 600;
const RETRY_DELAY_MS = 5000;
const CACHE_PREFIX = "almanac:state:";
const CACHE_EVENT = "almanac:tool-cache";

export type SyncStatus =
  /** Nothing to show yet: no copy on this device, and the server hasn't answered. */
  | { kind: "loading" }
  /** The server couldn't be reached and there's no copy on this device. */
  | { kind: "unavailable"; message: string }
  | { kind: "saved" }
  | { kind: "saving" }
  /** Edits are kept on this device and will be saved when the server can be reached. */
  | { kind: "unsaved"; message: string };

/** The copy of a tool's state kept on this device. */
interface Cached<T extends ToolId> {
  readonly state: ToolState<T>;
  /** Whether it has edits the server doesn't have yet. */
  readonly dirty: boolean;
  /** Why the last save failed, or null if it hasn't since the last one that worked. */
  readonly error: string | null;
}

function cacheSchema(tool: ToolId) {
  return z.object({
    state: toolSchemas[tool].storedState,
    dirty: z.boolean(),
    // Copies cached before failed saves were remembered don't have one.
    error: z.string().nullable().default(null),
  });
}

// TypeScript can't relate a schema looked up by a generic tool id to that tool's type, so these
// assert what the lookup guarantees.
function readCache<T extends ToolId>(tool: T): Cached<T> | null {
  return readLocal(`${CACHE_PREFIX}${tool}`, cacheSchema(tool)) as Cached<T> | null;
}

/** State in the shape the server stores it, so the copy here matches what's saved. */
function canonical<T extends ToolId>(tool: T, state: ToolState<T>): ToolState<T> {
  return toolSchemas[tool].state.parse(state) as ToolState<T>;
}

function writeCache<T extends ToolId>(tool: T, cached: Cached<T>): void {
  writeLocal(`${CACHE_PREFIX}${tool}`, cached);
  window.dispatchEvent(new Event(CACHE_EVENT));
}

/** How many components are using each tool's state, and so saving its edits. */
const users = new Map<ToolId, number>();

/**
 * The save in flight for each tool. There's only ever one, even across components using the same
 * tool (such as one left and another opened), so saves reach the server in the order they're made.
 */
const inFlight = new Map<ToolId, Promise<void>>();

function changeUsers(tool: ToolId, change: 1 | -1): void {
  const count = (users.get(tool) ?? 0) + change;
  if (count < 0) throw new Error(`${tool} state was released more often than it was used`);
  users.set(tool, count);
  window.dispatchEvent(new Event(CACHE_EVENT));
}

/** Calls `listener` whenever a tool's copy on this device, or whether it's in use, changes. */
export function subscribeToolCaches(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(CACHE_PREFIX)) listener();
  };
  window.addEventListener(CACHE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CACHE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * A notice while this device has edits to a tool's state that the server doesn't: because the
 * last save failed, or because the tool was left before they were saved. Edits being saved as
 * usual while the tool is open don't raise one. It can't be dismissed, as edits could be lost.
 */
export function unsavedNotices(tool: ToolId, toolName: string): Notice[] {
  const cached = readCache(tool);
  if (!cached?.dirty) return [];
  const open = (users.get(tool) ?? 0) > 0;
  if (open && cached.error === null) return [];
  return [
    {
      id: `${tool}:unsaved`,
      severity: "warning",
      dismissible: false,
      title: `${toolName} changes aren't saved yet`,
      body:
        cached.error === null
          ? `They're kept on this device and will be saved when you next open ${toolName.toLowerCase()}.`
          : `They're kept on this device and will be saved when the laptop can be reached. (${cached.error})`,
    },
  ];
}

/**
 * A tool's state, shared across devices through the server. Edits apply at once, are kept on
 * this device so nothing is lost offline, and are saved shortly after they stop, or straight away
 * when the tool is left or the app goes to the background. One save is in flight at a time, so
 * saves reach the server in the order they were made. While there are no unsaved edits, the
 * server's copy wins, so returning to the app shows the latest state from whichever device last
 * changed it.
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
  const [cached] = useState(() => readCache(tool));
  const [state, setLocalState] = useState<ToolState<T> | null>(() => cached?.state ?? null);
  const [status, setStatus] = useState<SyncStatus>(
    cached === null
      ? { kind: "loading" }
      : cached.dirty
        ? { kind: "unsaved", message: cached.error ?? "Not saved yet" }
        : { kind: "saved" },
  );
  const latest = useRef<{
    state: ToolState<T> | null;
    dirty: boolean;
    error: string | null;
    /** Counts edits, so a save can tell whether there were more while it was in flight. */
    version: number;
  }>({ state, dirty: cached?.dirty ?? false, error: cached?.error ?? null, version: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Whether this component is mounted, and so should keep retrying failed saves. */
  const open = useRef(false);
  /** Whether a save is waiting for the one in flight to finish. */
  const queued = useRef(false);
  const defaultsRef = useRef(defaults);
  useEffect(() => {
    defaultsRef.current = defaults;
  }, [defaults]);
  const saveRef = useRef<() => void>(() => undefined);
  const hasUnsavedEdits = () => latest.current.dirty;

  const remember = useCallback(
    (next: ToolState<T>, change: { dirty: boolean; error: string | null; edited: boolean }) => {
      const { version } = latest.current;
      latest.current = {
        state: next,
        dirty: change.dirty,
        error: change.error,
        version: change.edited ? version + 1 : version,
      };
      writeCache(tool, { state: next, dirty: change.dirty, error: change.error });
    },
    [tool],
  );

  const cancelTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const schedule = useCallback(
    (delay: number, save: () => void) => {
      cancelTimer();
      timer.current = setTimeout(() => {
        timer.current = null;
        save();
      }, delay);
    },
    [cancelTimer],
  );

  const save = useCallback((): void => {
    const { state: toSave, dirty, version } = latest.current;
    if (!dirty || toSave === null) return;
    const running = inFlight.get(tool);
    if (running !== undefined) {
      if (!queued.current) {
        queued.current = true;
        void running.finally(() => {
          queued.current = false;
          saveRef.current();
        });
      }
      return;
    }
    cancelTimer();
    setStatus({ kind: "saving" });
    // The copy on this device can be newer than what this component saved, if the tool was left
    // and opened again while it was in flight, so it's only marked saved if it's what was saved.
    const request = putState(tool, toSave).then(
      () => {
        const cachedNow = readCache(tool);
        if (cachedNow !== null && JSON.stringify(cachedNow.state) === JSON.stringify(toSave)) {
          writeCache(tool, { state: toSave, dirty: false, error: null });
        }
        if (latest.current.version === version) {
          latest.current = { ...latest.current, dirty: false, error: null };
          setStatus({ kind: "saved" });
        }
      },
      (error: unknown) => {
        const message = errorMessage(error);
        const cachedNow = readCache(tool);
        if (cachedNow === null) throw new Error(`${tool} has no copy on this device to keep`);
        writeCache(tool, { ...cachedNow, dirty: true, error: message });
        latest.current = { ...latest.current, error: message };
        setStatus({ kind: "unsaved", message });
        if (open.current && timer.current === null) schedule(RETRY_DELAY_MS, saveRef.current);
      },
    );
    const settled = request.finally(() => {
      inFlight.delete(tool);
    });
    inFlight.set(tool, settled);
  }, [tool, cancelTimer, schedule]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const load = useCallback(async () => {
    if (latest.current.dirty) {
      save();
      return;
    }
    try {
      const saved = await getState(tool);
      // An edit made while the request was in flight wins over what the server had.
      if (hasUnsavedEdits()) return;
      const next = saved?.state ?? latest.current.state ?? defaultsRef.current();
      remember(next, { dirty: false, error: null, edited: false });
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
    open.current = true;
    changeUsers(tool, 1);
    void load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
      // The app may not come back, so save now rather than after the delay.
      else save();
    };
    const onOnline = () => void load();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      // Leaving the tool saves edits still waiting for their delay. Failed saves aren't retried
      // after that: the edits stay on the device and are saved when the tool is next opened.
      save();
      cancelTimer();
      open.current = false;
      changeUsers(tool, -1);
    };
  }, [tool, load, save, cancelTimer]);

  const replaceState = useCallback(
    (next: ToolState<T>) => {
      const shaped = canonical(tool, next);
      remember(shaped, { dirty: true, error: latest.current.error, edited: true });
      setLocalState(shaped);
      schedule(SAVE_DELAY_MS, save);
    },
    [tool, remember, schedule, save],
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
