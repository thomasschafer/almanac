import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { z } from "zod";
import type { Notice } from "../../shared/notices.ts";
import { readLocal, writeLocal } from "../local-store.ts";
import { tools } from "../tools/registry.tsx";

const DISMISSED_KEY = "almanac:dismissed-notices";
const RECHECK_MS = 60 * 60 * 1000;

export interface ShownNotice extends Notice {
  /** The tool it came from, for linking to it. */
  readonly toolId: string;
  readonly dismissed: boolean;
  /** Errors can't be dismissed: they stay until whatever caused them is fixed. */
  readonly dismissible: boolean;
}

interface NoticesValue {
  notices: readonly ShownNotice[];
  /** Notices that haven't been dismissed. */
  active: readonly ShownNotice[];
  dismiss: (id: string) => void;
  /** Lets a mounted tool add notices about its own state, such as unsaved edits. */
  publish: (source: string, notices: readonly (Notice & { toolId: string })[]) => void;
}

const NoticesContext = createContext<NoticesValue | null>(null);

export function NoticesProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => new Date());
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(
    () => new Set(readLocal(DISMISSED_KEY, z.array(z.string())) ?? []),
  );
  const [published, setPublished] = useState<
    Readonly<Record<string, readonly (Notice & { toolId: string })[]>>
  >({});

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, RECHECK_MS);
    return () => {
      clearInterval(interval);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setDismissed((current) => {
      const next = new Set(current).add(id);
      writeLocal(DISMISSED_KEY, [...next]);
      return next;
    });
  }, []);

  const publish = useCallback(
    (source: string, notices: readonly (Notice & { toolId: string })[]) => {
      setPublished((current) => {
        if (notices.length === 0 && !(source in current)) return current;
        const others = Object.fromEntries(
          Object.entries(current).filter(([key]) => key !== source),
        );
        return notices.length === 0 ? others : { ...others, [source]: notices };
      });
    },
    [],
  );

  const value = useMemo<NoticesValue>(() => {
    const fromTools = tools.flatMap((tool) =>
      tool.notices(now).map((notice) => ({ ...notice, toolId: tool.id })),
    );
    const notices = [...Object.values(published).flat(), ...fromTools].map((notice) => {
      const dismissible = notice.severity !== "error";
      return { ...notice, dismissible, dismissed: dismissible && dismissed.has(notice.id) };
    });
    const order = { error: 0, warning: 1, info: 2 } as const;
    notices.sort((a, b) => order[a.severity] - order[b.severity]);
    return { notices, active: notices.filter((n) => !n.dismissed), dismiss, publish };
  }, [now, published, dismissed, dismiss, publish]);

  return <NoticesContext value={value}>{children}</NoticesContext>;
}

export function useNotices(): NoticesValue {
  const value = useContext(NoticesContext);
  if (value === null) throw new Error("useNotices must be used inside NoticesProvider");
  return value;
}

/** Publishes notices from a component for as long as it's mounted. */
export function usePublishNotices(
  source: string,
  notices: readonly (Notice & { toolId: string })[],
): void {
  const { publish } = useNotices();
  const key = JSON.stringify(notices);
  useEffect(() => {
    publish(source, JSON.parse(key) as (Notice & { toolId: string })[]);
  }, [publish, source, key]);
  useEffect(
    () => () => {
      publish(source, []);
    },
    [publish, source],
  );
}
