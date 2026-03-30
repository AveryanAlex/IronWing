import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { DocsLink } from "./DocsLink";

export type SetupSectionIntroProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  docsUrl?: string | null;
  docsLabel?: string;
  actionSlot?: ReactNode;
  children?: ReactNode;
};

export function SetupSectionIntro({
  icon: Icon,
  title,
  description,
  docsUrl,
  docsLabel,
  actionSlot,
  children,
}: SetupSectionIntroProps) {
  return (
    <div className="rounded-lg border border-border-light bg-accent/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Icon size={14} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              {title}
            </h3>
            <p className="mt-0.5 text-[10px] leading-relaxed text-text-muted">
              {description}
            </p>
            <DocsLink
              docsUrl={docsUrl}
              docsLabel={docsLabel}
              variant="inline"
              className="mt-1"
            />
          </div>
        </div>
        {actionSlot && <div className="shrink-0">{actionSlot}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
