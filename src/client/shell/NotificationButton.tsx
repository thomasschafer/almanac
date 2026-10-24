import { AlertCircle, AlertTriangle, Bell, Info } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Sheet } from "../ui/Sheet.tsx";
import { tools } from "../tools/registry.tsx";
import { type ShownNotice, useNotices } from "./notices.tsx";

const icons = { error: AlertCircle, warning: AlertTriangle, info: Info } as const;

export function NotificationButton() {
  const { notices, active } = useNotices();
  const [open, setOpen] = useState(false);
  const worst = active[0]?.severity;
  const dismissed = notices.filter((n) => n.dismissed);

  return (
    <>
      <button
        type="button"
        className="icon-button bell"
        aria-label={
          active.length === 0 ? "Notifications" : `Notifications, ${String(active.length)} new`
        }
        onClick={() => {
          setOpen(true);
        }}
      >
        <Bell size={20} />
        {worst !== undefined && <span className={`bell-dot ${worst}`} />}
      </button>
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Notifications"
      >
        {notices.length === 0 ? (
          <p className="empty">Nothing needs your attention.</p>
        ) : (
          <div className="notice-list">
            {active.map((notice) => (
              <NoticeCard
                key={notice.id}
                notice={notice}
                onNavigate={() => {
                  setOpen(false);
                }}
              />
            ))}
            {active.length === 0 && <p className="empty">Nothing new.</p>}
            {dismissed.length > 0 && (
              <details className="dismissed">
                <summary>Dismissed ({dismissed.length})</summary>
                {dismissed.map((notice) => (
                  <NoticeCard
                    key={notice.id}
                    notice={notice}
                    onNavigate={() => {
                      setOpen(false);
                    }}
                  />
                ))}
              </details>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}

function NoticeCard({ notice, onNavigate }: { notice: ShownNotice; onNavigate: () => void }) {
  const { dismiss } = useNotices();
  const Icon = icons[notice.severity];
  const tool = tools.find((t) => t.id === notice.toolId);
  return (
    <article className={`notice ${notice.severity}${notice.dismissed ? " is-dismissed" : ""}`}>
      <Icon size={18} className="notice-icon" aria-label={notice.severity} />
      <div>
        <h3>{notice.title}</h3>
        <p>{notice.body}</p>
        <div className="notice-actions">
          {tool !== undefined && (
            <Link to={tool.path} onClick={onNavigate}>
              {tool.name}
            </Link>
          )}
          {notice.dismissible && !notice.dismissed && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                dismiss(notice.id);
              }}
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
