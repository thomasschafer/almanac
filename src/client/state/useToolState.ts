import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ToolId, ToolState } from "../../shared/tools.ts";
import { type Consumer, type SyncStatus, toolStore } from "./tool-store.ts";

export type { SyncStatus } from "./tool-store.ts";

/**
 * A tool's state, from the store this tab shares between everything using it. See `toolStore`
 * for how it's kept and saved.
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
  const store = toolStore(tool);
  const { state, status } = useSyncExternalStore(store.subscribe, store.snapshot);
  const defaultsRef = useRef(defaults);
  useEffect(() => {
    defaultsRef.current = defaults;
  }, [defaults]);
  const [consumer] = useState<Consumer<T>>(() => ({ defaults: () => defaultsRef.current() }));
  useEffect(() => store.acquire(consumer), [store, consumer]);

  const replaceState = useCallback(
    (next: ToolState<T>) => {
      store.edit(() => next);
    },
    [store],
  );

  const setState = useCallback(
    (update: (current: ToolState<T>) => ToolState<T>) => {
      store.edit((current) => {
        if (current === null) throw new Error(`${tool} state was edited before it loaded`);
        return update(current);
      });
    },
    [tool, store],
  );

  return { state, setState, replaceState, status, retry: store.load };
}
