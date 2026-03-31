import { cn } from "../lib/utils";
import { type ActiveTab, TABS } from "../types";

const MOBILE_LABELS: Partial<Record<ActiveTab, string>> = {
  telemetry: "Telem",
};

type BottomNavProps = {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isConnecting: boolean;
  connected: boolean;
  connectionError: string | null;
  onSidebarOpen: () => void;
};

export function BottomNav({ activeTab, onTabChange, isConnecting, connected, connectionError, onSidebarOpen }: BottomNavProps) {
  return (
    <nav
      className="w-full shrink-0 overflow-hidden border-t border-border bg-bg-secondary"
      style={{ paddingBottom: "var(--safe-area-bottom, 0px)" }}
    >
      <div className="flex w-full items-stretch">
        <button
          onClick={onSidebarOpen}
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-2"
          aria-label="Vehicle panel"
        >
          <div className={cn(
            "h-3 w-3 rounded-full",
            isConnecting ? "bg-warning animate-pulse" :
            connected ? "bg-success" :
            connectionError ? "bg-danger" :
            "bg-text-muted"
          )} />
          <span className="truncate text-[9px] leading-none text-text-muted">Vehicle</span>
        </button>

        {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-2 transition-colors",
            activeTab === id
              ? "text-accent"
              : "text-text-muted"
          )}
        >
          <Icon size={18} />
          <span className="truncate text-[9px] leading-none">{MOBILE_LABELS[id] ?? label}</span>
        </button>
        ))}
      </div>
    </nav>
  );
}
