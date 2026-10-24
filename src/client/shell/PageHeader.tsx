import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { NotificationButton } from "./NotificationButton.tsx";

export function PageHeader({
  title,
  back = true,
  actions,
  subtitle,
}: {
  title: string;
  back?: boolean;
  actions?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-title">
        {back && (
          <Link to="/" className="back">
            <ChevronLeft size={14} aria-hidden />
            Almanac
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
