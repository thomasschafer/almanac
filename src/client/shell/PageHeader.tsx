import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { NotificationButton } from "./NotificationButton.tsx";

export function PageHeader({
  title,
  back = { to: "/", label: "Almanac" },
  actions,
  subtitle,
}: {
  title: string;
  /** Where the back link goes, or null for none. */
  back?: { to: string; label: string } | null;
  actions?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-title">
        {back !== null && (
          <Link to={back.to} className="back">
            <ChevronLeft size={14} aria-hidden />
            {back.label}
          </Link>
        )}
        <h1>{title}</h1>
        {subtitle !== undefined && <div className="page-subtitle">{subtitle}</div>}
      </div>
      <div className="page-actions">
        {actions}
        <NotificationButton />
      </div>
    </header>
  );
}
