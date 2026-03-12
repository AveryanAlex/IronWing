import { ArrowUpCircle, ArrowDownCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import type { TransferUi } from "../../hooks/use-mission";

type MissionTransferStatusProps = {
  transferUi: TransferUi;
  roundtripStatus: string;
  onCancel?: () => void;
};

export function MissionTransferStatus({ transferUi, roundtripStatus, onCancel }: MissionTransferStatusProps) {
  const { active, hasProgress, progressPct, direction, completedItems, totalItems } = transferUi;

  if (!active && !hasProgress && !roundtripStatus) return null;

  const DirectionIcon = direction === "upload" ? ArrowUpCircle : ArrowDownCircle;

  return (
    <div
      data-mission-transfer-status
      className="rounded-lg border border-border bg-bg-primary p-3"
    >
      <div className="flex items-center gap-2 text-xs">
        {active ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
        ) : roundtripStatus.startsWith("Roundtrip: pass") ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
        ) : (
          <DirectionIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        )}

        <div className="min-w-0 flex-1">
          {hasProgress && (
            <>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="font-medium text-text-secondary">
                  {direction === "upload" ? "Uploading" : "Downloading"}
                </span>
                <span className="tabular-nums text-text-muted">
                  {completedItems}/{totalItems}
                </span>
              </div>
              <Progress value={progressPct} className="h-1.5" />
            </>
          )}
          {!hasProgress && roundtripStatus && (
            <span className="text-text-muted">{roundtripStatus}</span>
          )}
        </div>

        {active && onCancel && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={onCancel}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
