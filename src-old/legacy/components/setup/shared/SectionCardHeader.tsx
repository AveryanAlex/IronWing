import type { LucideIcon } from "lucide-react";
import { DocsLink } from "./DocsLink";

export type SectionCardHeaderProps = {
  icon: LucideIcon;
  title: string;
  docsUrl?: string | null;
  docsLabel?: string;
};

export function SectionCardHeader({
  icon: Icon,
  title,
  docsUrl,
  docsLabel,
}: SectionCardHeaderProps) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {title}
        </h3>
      </div>
      <DocsLink docsUrl={docsUrl} docsLabel={docsLabel} />
    </div>
  );
}
