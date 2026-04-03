import { useEffect, useMemo, useState } from "react";
import { Layers3, Trash2, XCircle } from "lucide-react";
import { Button } from "../ui/button";
import type { useMission } from "../../hooks/use-mission";

type BulkEditPanelProps = {
  mission: ReturnType<typeof useMission>;
};

function sharedAltitudeValue(mission: ReturnType<typeof useMission>["current"]): string {
  if (mission.tab === "fence") return "";

  const selectedAltitudes = mission.draftItems
    .filter((item) => mission.selectedUiIds.has(item.uiId))
    .map((item) => item.preview.altitude_m)
    .filter((altitude): altitude is number => altitude !== null);

  if (selectedAltitudes.length === 0) return "";
  const [first] = selectedAltitudes;
  if (first === undefined) return "";
  return selectedAltitudes.every((altitude) => altitude === first) ? String(first) : "";
}

export function BulkEditPanel({ mission }: BulkEditPanelProps) {
  const current = mission.current;
  const altitudeEditable = current.tab !== "fence";
  const derivedAltitude = useMemo(() => sharedAltitudeValue(current), [current]);
  const [altitudeInput, setAltitudeInput] = useState(derivedAltitude);

  useEffect(() => {
    setAltitudeInput(derivedAltitude);
  }, [derivedAltitude, current.selectedCount, current.selectedIndices]);

  const handleAltitudeCommit = () => {
    if (!altitudeEditable) return;
    const nextValue = altitudeInput.trim();
    if (nextValue.length === 0) {
      setAltitudeInput(derivedAltitude);
      return;
    }

    const altitudeM = Number(nextValue);
    if (!Number.isFinite(altitudeM)) {
      setAltitudeInput(derivedAltitude);
      return;
    }

    current.bulkUpdateAltitude(altitudeM);
  };

  return (
    <div
      data-mission-bulk-edit-panel
      className="space-y-3 rounded-lg border border-border bg-bg-secondary p-3"
    >
      <div className="flex items-center gap-2">
        <Layers3 className="h-3.5 w-3.5 text-accent" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Bulk Edit
        </span>
        <span className="ml-auto text-[10px] tabular-nums text-text-muted">
          {current.selectedCount} selected
        </span>
      </div>

      <p className="text-xs text-text-muted">
        {current.tab === "mission"
          ? "Apply the same altitude or delete the selected waypoints in one step."
          : current.tab === "rally"
            ? "Apply the same altitude or delete the selected rally points in one step."
            : "Delete the selected fence items or clear the current selection."}
      </p>

      {altitudeEditable ? (
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-text-muted">
            Altitude <span className="text-text-muted/50">(m)</span>
          </label>
          <input
            data-mission-bulk-altitude
            type="number"
            step="any"
            value={altitudeInput}
            onChange={(event) => setAltitudeInput(event.target.value)}
            onBlur={handleAltitudeCommit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            disabled={current.readOnly}
            placeholder={derivedAltitude.length === 0 ? "Mixed altitude" : undefined}
            className="w-full rounded border border-border bg-bg-input px-2 py-1.5 text-xs tabular-nums text-text-primary"
          />
        </div>
      ) : (
        <div className="rounded border border-border/70 bg-bg-primary px-2.5 py-2 text-xs text-text-muted">
          Altitude bulk edits are only available for mission and rally items.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          data-mission-bulk-delete
          variant="destructive"
          size="sm"
          disabled={current.readOnly || current.selectedCount === 0}
          onClick={current.bulkDelete}
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete Selected
        </Button>
        <Button
          data-mission-bulk-deselect
          variant="secondary"
          size="sm"
          disabled={current.selectedCount === 0}
          onClick={current.deselectAll}
        >
          <XCircle className="h-3.5 w-3.5" /> Deselect All
        </Button>
      </div>
    </div>
  );
}
