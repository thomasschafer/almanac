import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import type { ReactNode } from "react";

const calloutIcons = { info: Info, warning: AlertTriangle, error: OctagonAlert } as const;

export function Callout({
  severity,
  title,
  children,
}: {
  severity: "info" | "warning" | "error";
  title: string;
  children: ReactNode;
}) {
  const Icon = calloutIcons[severity];
  return (
    <aside className={`callout ${severity}`}>
      <Icon size={18} className="callout-icon" aria-hidden />
      <div>
        <h3>{title}</h3>
        <div className="callout-body">{children}</div>
      </div>
    </aside>
  );
}
