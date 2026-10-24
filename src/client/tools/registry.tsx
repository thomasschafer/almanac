import { Banknote, type LucideIcon } from "lucide-react";
import { lazy, type LazyExoticComponent, type ComponentType } from "react";
import type { Notice } from "../../shared/notices.ts";
import { takeHomeNotices } from "../../shared/take-home/rules/review.ts";

export interface Tool {
  readonly id: string;
  readonly name: string;
  /** One line, shown on the index. */
  readonly description: string;
  readonly icon: LucideIcon;
  /** The tool's identity colour: a CSS colour, usually a token. */
  readonly color: string;
  readonly path: string;
  readonly Page: LazyExoticComponent<ComponentType>;
  /** Notices about the tool itself, independent of its state, such as out-of-date rules. */
  readonly notices: (now: Date) => Notice[];
}

export const tools: readonly Tool[] = [
  {
    id: "take-home",
    name: "Take-home pay",
    description: "What lands in your account after tax, NI, pension and student loans",
    icon: Banknote,
    color: "var(--take-home)",
    path: "/take-home",
    Page: lazy(() => import("./take-home/TakeHomeTool.tsx")),
    notices: (now) => takeHomeNotices(now),
  },
];
