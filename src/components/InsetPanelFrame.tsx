import type { ReactNode } from "react";

/**
 * Inset frame providing app-standard gutter padding for non-edge-to-edge panels.
 *
 * Used in App.tsx to wrap every tab panel *except* Setup, which renders
 * edge-to-edge so its shell-owned staged tray can dock flush to the viewport.
 */
export function InsetPanelFrame({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-hidden p-2 lg:p-3">
      {children}
    </div>
  );
}
