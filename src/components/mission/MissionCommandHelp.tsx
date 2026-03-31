import { Info, AlertTriangle, ExternalLink } from "lucide-react";
import { openUrl } from "@platform/core";
import type { CommandMetadata } from "../../lib/mission-command-metadata";

type MissionCommandHelpProps = {
  metadata: CommandMetadata;
  className?: string;
};

export function MissionCommandHelp({ metadata, className }: MissionCommandHelpProps) {
  const hasNotes = metadata.notes && metadata.notes.length > 0;
  const hasDocs = !!metadata.docsUrl;

  if (!hasNotes && !hasDocs) return null;

  return (
    <div
      data-mission-command-help
      className={`rounded-md border border-border bg-bg-primary/50 p-2.5 text-[10px] leading-relaxed text-text-muted${className ? ` ${className}` : ""}`}
    >
      <div className="flex items-start gap-1.5">
        <Info className="mt-0.5 h-3 w-3 shrink-0 text-accent/60" />
        <span className="text-text-secondary">{metadata.summary}</span>
      </div>

      {hasNotes && (
        <ul className="mt-1.5 space-y-1 pl-[18px]">
          {metadata.notes!.map((note, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-warning/60" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}

      {hasDocs && (
        <button
          type="button"
          onClick={() => { void openUrl(metadata.docsUrl!); }}
          className="mt-1.5 inline-flex items-center gap-1 text-accent hover:underline"
        >
          ArduPilot Docs
          <ExternalLink className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}
