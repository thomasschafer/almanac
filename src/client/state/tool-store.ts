import { z } from "zod";
import type { Notice } from "../../shared/notices.ts";
import { isToolId, type ToolId, type ToolState, toolSchemas } from "../../shared/tools.ts";
import { getState, putState } from "../api.ts";
import { readLocal, writeLocal } from "../local-store.ts";

const SAVE_DELAY_MS = 600;
const RETRY_DELAY_MS = 5000;
const CACHE_PREFIX = "almanac:state:";
const CACHE_EVENT = "almanac:tool-cache";
const CHANNEL = "almanac:tool-state";

export type SyncStatus =
  /** Nothing to show yet: no copy on this device, and the server hasn't answered. */
  | { kind: "loading" }
  /** The server couldn't be reached and there's no copy on this device. */
  | { kind: "unavailable"; message: string }
  | { kind: "saved" }
  | { kind: "saving" }
  /** Edits are kept on this device and will be saved when the server can be reached. */
  | { kind: "unsaved"; message: string };

/** The copy of a tool's state kept on this device, shared by every tab. */
interface Cached<T extends ToolId> {
  readonly state: ToolState<T>;
  /** Whether it has edits the server doesn't have yet. */
  readonly dirty: boolean;
  /** Why the last save failed, or null if it hasn't since the last one that worked. */
  readonly error: string | null;
  /**
   * Goes up with every change to the copy, from any tab, so a tab can tell whether the copy has
   * changed since it last looked, such as while a load was in flight.
   */
  readonly revision: number;
}

function cacheSchema(tool: ToolId) {
  return z.object({
    state: toolSchemas[tool].storedState,
    dirty: z.boolean(),
    // Copies cached before failed saves were remembered don't have one.
    error: z.string().nullable().default(null),
    // Nor do copies cached before tabs shared their edits.
    revision: z.number().int().nonnegative().default(0),
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

/** Tells other tabs that a tool's copy on this device has changed. */
const changeMessage = z.object({
  tool: z.custom<ToolId>((tool) => typeof tool === "string" && isToolId(tool)),
});

let channel: BroadcastChannel | null = null;

function tabs(): BroadcastChannel {
  if (channel === null) {
    channel = new BroadcastChannel(CHANNEL);
    channel.addEventListener("message", (event: MessageEvent) => {
      const { tool } = changeMessage.parse(event.data);
      stores.get(tool)?.sync();
      window.dispatchEvent(new Event(CACHE_EVENT));
    });
  }
  return channel;
}

/** Calls `listener` whenever a tool's copy on this device, or whether it's in use, changes. */
export function subscribeToolCaches(listener: () => void): () => void {
  // Changes from other tabs arrive on the channel, which only listens once it's been opened.
  tabs();
  window.addEventListener(CACHE_EVENT, listener);
  return () => {
    window.removeEventListener(CACHE_EVENT, listener);
  };
}

/**
 * A notice while this device has edits to a tool's state that the server doesn't: because the
 * last save failed, or because the tool was left before they were saved. Edits being saved as
 * usual while the tool is open in this tab don't raise one. It can't be dismissed, as edits could
 * be lost.
 */
export function unsavedNotices(tool: ToolId, toolName: string): Notice[] {
  const cached = readCache(tool);
  if (!cached?.dirty) return [];
  const open = (stores.get(tool)?.consumers() ?? 0) > 0;
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

export interface Snapshot<T extends ToolId> {
  readonly state: ToolState<T> | null;
  readonly status: SyncStatus;
}

/** Something using a tool's state, such as a component. */
export interface Consumer<T extends ToolId> {
  /** The state to start from if neither the server nor this device has any. */
  readonly defaults: () => ToolState<T>;
}

export interface ToolStore<T extends ToolId> {
  readonly subscribe: (listener: () => void) => () => void;
  readonly snapshot: () => Snapshot<T>;
  /** Starts using the state, loading it from the server. Returns a function to stop. */
  readonly acquire: (consumer: Consumer<T>) => () => void;
  readonly edit: (update: (current: ToolState<T> | null) => ToolState<T>) => void;
  readonly load: () => void;
  /** Picks up a newer copy from another tab, if there is one. */
  readonly sync: () => void;
  readonly consumers: () => number;
}

/**
 * Every tool's store in this tab. Everything using a tool's state shares its store, so there's
 * one copy of the state, one record of whether it's saved, and one queue of saves.
 */
const stores = new Map<ToolId, ToolStore<ToolId>>();

export function toolStore<T extends ToolId>(tool: T): ToolStore<T> {
  let store = stores.get(tool);
  if (store === undefined) {
    // Listen for changes from other tabs before there's anything to miss.
    tabs();
    store = createToolStore(tool);
    stores.set(tool, store);
  }
  return store;
}

/**
 * A tool's state, shared across devices through the server and across tabs through the copy on
 * this device. Edits apply at once, are kept on the device so nothing is lost offline, and are
 * saved shortly after they stop, or straight away when something using them stops or the app
 * goes to the background. One save from a tab is in flight at a time, so its saves reach the
 * server in the order they were made. While there are no unsaved edits, the server's copy wins,
 * so returning to the app shows the latest state from whichever device last changed it.
 */
function createToolStore<T extends ToolId>(tool: T): ToolStore<T> {
  let local: Cached<T> | null = readCache(tool);
  /** Why loading failed, while there's nothing to show. */
  let loadError: string | null = null;
  const users = new Set<Consumer<T>>();
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** This tab's save in flight, settled once it's no longer in flight. */
  let inFlight: Promise<void> | null = null;
  /** Whether a save is waiting for the one in flight to finish. */
  let queued = false;
  /** Counts loads started, so only the latest one's answer is used. */
  let loads = 0;
  let snapshot: Snapshot<T> = { state: local?.state ?? null, status: status() };

  function status(): SyncStatus {
    if (local === null) {
      return loadError === null ? { kind: "loading" } : { kind: "unavailable", message: loadError };
    }
    if (!local.dirty) return { kind: "saved" };
    if (inFlight !== null || queued) return { kind: "saving" };
    return { kind: "unsaved", message: local.error ?? "Not saved yet" };
  }

  function publish(): void {
    snapshot = { state: local?.state ?? null, status: status() };
    for (const listener of listeners) listener();
  }

  /** Picks up the copy on this device if another tab has changed it. */
  function sync(): void {
    const cached = readCache(tool);
    if (cached !== null && (local === null || cached.revision > local.revision)) {
      local = cached;
      publish();
    }
  }

  /** The only way the copy on this device is written. */
  function commit(next: Omit<Cached<T>, "revision">): void {
    const revision = Math.max(local?.revision ?? 0, readCache(tool)?.revision ?? 0) + 1;
    local = { ...next, revision };
    writeLocal(`${CACHE_PREFIX}${tool}`, local);
    window.dispatchEvent(new Event(CACHE_EVENT));
    tabs().postMessage({ tool } satisfies z.infer<typeof changeMessage>);
    publish();
  }

  function cancelTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule(delay: number): void {
    cancelTimer();
    timer = setTimeout(() => {
      timer = null;
      save();
    }, delay);
  }

  function save(): void {
    sync();
    if (!local?.dirty) return;
    if (inFlight !== null) {
      if (!queued) {
        queued = true;
        void inFlight.finally(() => {
          queued = false;
          save();
        });
      }
      return;
    }
    cancelTimer();
    const { state: toSave, revision } = local;
    const request = putState(tool, toSave).then(
      () => {
        sync();
        if (local === null) throw new Error(`${tool} has no copy on this device after saving`);
        // Edits made since, here or in another tab, still need saving.
        if (local.revision === revision) commit({ ...local, dirty: false, error: null });
      },
      (error: unknown) => {
        sync();
        if (local === null) throw new Error(`${tool} has no copy on this device to keep`);
        commit({ ...local, dirty: true, error: errorMessage(error) });
        if (users.size > 0 && timer === null) schedule(RETRY_DELAY_MS);
      },
    );
    inFlight = request.finally(() => {
      inFlight = null;
      publish();
    });
    publish();
  }

  function load(): void {
    sync();
    if (local?.dirty === true) {
      save();
      return;
    }
    const load = ++loads;
    const revision = local?.revision ?? null;
    // What the server had when the request started is out of date if the copy here has changed
    // since, even with an edit that's already saved, or a newer load has started.
    const current = () => {
      sync();
      return users.size > 0 && loads === load && (local?.revision ?? null) === revision;
    };
    const consumer = [...users].at(-1);
    if (consumer === undefined) throw new Error(`${tool} state was loaded with nothing using it`);
    getState(tool).then(
      (saved) => {
        if (!current()) return;
        loadError = null;
        const next = saved?.state ?? local?.state ?? consumer.defaults();
        if (local !== null && JSON.stringify(local.state) === JSON.stringify(next)) {
          publish();
          return;
        }
        commit({ state: next, dirty: false, error: null });
      },
      (error: unknown) => {
        if (!current()) return;
        loadError = errorMessage(error);
        publish();
      },
    );
  }

  const onVisibility = () => {
    if (document.visibilityState === "visible") load();
    // The app may not come back, so save now rather than after the delay.
    else save();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => snapshot,
    acquire(consumer) {
      if (users.has(consumer)) throw new Error(`${tool} state was used twice by one consumer`);
      users.add(consumer);
      if (users.size === 1) {
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("online", load);
        window.dispatchEvent(new Event(CACHE_EVENT));
      }
      load();
      return () => {
        if (!users.delete(consumer)) {
          throw new Error(`${tool} state was released more often than it was used`);
        }
        // Edits still waiting for their delay are saved when anything using them stops. Failed
        // saves aren't retried once nothing is: the edits stay on the device and are saved when
        // the tool is next opened.
        save();
        if (users.size === 0) {
          cancelTimer();
          document.removeEventListener("visibilitychange", onVisibility);
          window.removeEventListener("online", load);
          window.dispatchEvent(new Event(CACHE_EVENT));
        }
      };
    },
    edit(update) {
      sync();
      commit({
        state: canonical(tool, update(local?.state ?? null)),
        dirty: true,
        error: local?.error ?? null,
      });
      schedule(SAVE_DELAY_MS);
    },
    load,
    sync,
    consumers: () => users.size,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
