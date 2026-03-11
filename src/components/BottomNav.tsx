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
      className="w-full shrink-0 overflow-x-auto overflow-y-hidden border-t border-border bg-bg-secondary"
      style={{ paddingBottom: "var(--safe-area-bottom, 0px)" }}
    >
      <div className="flex min-w-[360px] items-center justify-around">
        <button
          onClick={onSidebarOpen}
          className="flex flex-col items-center justify-center gap-0.5 px-2 py-2"
          aria-label="Vehicle panel"
        >
          <div className={cn(
            "h-3 w-3 rounded-full",
            isConnecting ? "bg-warning animate-pulse" :
            connected ? "bg-success" :
            connectionError ? "bg-danger" :
            "bg-text-muted"
          )} />
          <span className="text-[10px] text-text-muted">Vehicle</span>
        </button>

        {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 px-2 py-2 transition-colors",
            activeTab === id
              ? "text-accent"
              : "text-text-muted"
          )}
        >
          <Icon size={18} />
          <span className="text-[10px]">{MOBILE_LABELS[id] ?? label}</span>
        </button>
        ))}
      </div>
    </nav>
  );
}
