import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { z } from "zod";
import type { Notice } from "../../shared/notices.ts";
import { readLocal, writeLocal } from "../local-store.ts";
import { subscribeToolCaches } from "../state/tool-store.ts";
import { tools } from "../tools/registry.tsx";

const DISMISSED_KEY = "almanac:dismissed-notices";
const RECHECK_MS = 60 * 60 * 1000;

export type ShownNotice = Notice & {
  /** The tool it came from, for linking to it. */
  readonly toolId: string;
  readonly dismissed: boolean;
};

interface NoticesValue {
  notices: readonly ShownNotice[];
  /** Notices that haven't been dismissed. */
  active: readonly ShownNotice[];
  dismiss: (id: string) => void;
}

const NoticesContext = createContext<NoticesValue | null>(null);

export function NoticesProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => new Date());
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(
    () => new Set(readLocal(DISMISSED_KEY, z.array(z.string())) ?? []),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, RECHECK_MS);
    return () => {
      clearInterval(interval);
    };
  }, []);

  // Tools' notices can depend on their state kept on this device, such as unsaved edits, so
  // they're worked out again whenever that changes. The snapshot is serialised so an unchanged
  // set of notices compares equal.
  const toolNotices = useSyncExternalStore(
    subscribeToolCaches,
    useCallback(
      () =>
        JSON.stringify(
          tools.flatMap((tool) => tool.notices(now).map((notice) => ({ notice, toolId: tool.id }))),
        ),
      [now],
    ),
  );

  const dismiss = useCallback((id: string) => {
    setDismissed((current) => {
      const next = new Set(current).add(id);
      writeLocal(DISMISSED_KEY, [...next]);
      return next;
    });
  }, []);

  const value = useMemo<NoticesValue>(() => {
    const fromTools = JSON.parse(toolNotices) as { notice: Notice; toolId: string }[];
    const notices = fromTools.map(({ notice, toolId }): ShownNotice => ({
      ...notice,
      toolId,
      dismissed: notice.dismissible && dismissed.has(notice.id),
    }));
    const order = { error: 0, warning: 1, info: 2 } as const;
    notices.sort((a, b) => order[a.severity] - order[b.severity]);
    return { notices, active: notices.filter((n) => !n.dismissed), dismiss };
  }, [toolNotices, dismissed, dismiss]);

  return <NoticesContext value={value}>{children}</NoticesContext>;
}

export function useNotices(): NoticesValue {
  const value = useContext(NoticesContext);
  if (value === null) throw new Error("useNotices must be used inside NoticesProvider");
  return value;
}
