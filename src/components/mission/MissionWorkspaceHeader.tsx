import {
  Upload, Download, ShieldCheck, Trash2,
  Plus, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, X, SkipForward,
  Grid3X3,
} from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import type { useMission } from "../../hooks/use-mission";
import type { MissionType } from "../../mission";

type MissionWorkspaceHeaderProps = {
  mission: ReturnType<typeof useMission>;
  connected: boolean;
  onAutoGrid?: () => void;
};

const isMissionOnly = (missionType: MissionType) => missionType === "mission";

function IconButton({ icon, label, onClick, disabled }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={onClick} disabled={disabled}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const MISSION_TYPE_LABELS: Record<MissionType, string> = {
  mission: "Mission",
  fence: "Fence",
  rally: "Rally",
};

export function MissionWorkspaceHeader({ mission, connected, onAutoGrid }: MissionWorkspaceHeaderProps) {
  const {
    items, selectedSeq, missionType, setMissionType,
    transferActive, isDirty,
    addWaypoint, insertBefore, insertAfter, deleteAt, moveUp, moveDown,
    validate, upload, download, verify, clear, setCurrent,
    updateHomeFromVehicle,
  } = mission;

  return (
    <div data-mission-workspace-header className="space-y-1">
      <div className="flex items-center gap-2">
        <select
          value={missionType}
          onChange={(e) => setMissionType(e.target.value as MissionType)}
          className="rounded-md border border-border bg-bg-input pl-2.5 pr-7 py-1.5 text-sm font-medium text-text-primary"
        >
          {(Object.keys(MISSION_TYPE_LABELS) as MissionType[]).map((key) => (
            <option key={key} value={key}>{MISSION_TYPE_LABELS[key]}</option>
          ))}
        </select>

        {isDirty && (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
            Modified
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" disabled={transferActive || !connected} onClick={upload}>
            <Upload className="h-3.5 w-3.5" /> Write
          </Button>
          <Button size="sm" disabled={transferActive || !connected} onClick={download}>
            <Download className="h-3.5 w-3.5" /> Read
          </Button>
          <Button variant="secondary" size="sm" disabled={transferActive || !connected} onClick={verify}>
            <ShieldCheck className="h-3.5 w-3.5" /> Verify
          </Button>
          <Button variant="destructive" size="sm" disabled={transferActive || !connected} onClick={clear}>
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0.5">
          <IconButton icon={<Plus className="h-3.5 w-3.5" />} label="Add Waypoint" onClick={addWaypoint} />
          <IconButton icon={<ChevronLeft className="h-3.5 w-3.5" />} label="Insert Before"
            onClick={() => insertBefore(selectedSeq ?? items.length)} />
          <IconButton icon={<ChevronRight className="h-3.5 w-3.5" />} label="Insert After"
            onClick={() => insertAfter(selectedSeq ?? items.length - 1)} />
          <IconButton icon={<X className="h-3.5 w-3.5" />} label="Delete Selected"
            onClick={() => deleteAt(selectedSeq ?? items.length - 1)}
            disabled={items.length === 0} />
        </div>

        <div className="mx-0.5 h-4 w-px bg-border" />

        <div className="flex items-center gap-0.5">
          <IconButton icon={<ArrowUp className="h-3.5 w-3.5" />} label="Move Up"
            onClick={() => { if (selectedSeq !== null) moveUp(selectedSeq); }}
            disabled={selectedSeq === null || selectedSeq <= 0} />
          <IconButton icon={<ArrowDown className="h-3.5 w-3.5" />} label="Move Down"
            onClick={() => { if (selectedSeq !== null) moveDown(selectedSeq); }}
            disabled={selectedSeq === null || selectedSeq >= Math.max(0, items.length - 1)} />
        </div>

        <div className="mx-0.5 h-4 w-px bg-border" />

        <Button variant="ghost" size="sm" onClick={validate}>Validate</Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                variant="ghost"
                size="sm"
                disabled={!connected || selectedSeq === null || !isMissionOnly(missionType)}
                onClick={() => setCurrent()}
              >
                <SkipForward className="h-3.5 w-3.5" /> Set Current
              </Button>
            </span>
          </TooltipTrigger>
          {!isMissionOnly(missionType) && (
            <TooltipContent>Set Current is only available in Mission mode</TooltipContent>
          )}
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                variant="ghost"
                size="sm"
                disabled={!isMissionOnly(missionType)}
                onClick={updateHomeFromVehicle}
              >
                Home from Vehicle
              </Button>
            </span>
          </TooltipTrigger>
          {!isMissionOnly(missionType) && (
            <TooltipContent>Home position is a Mission-only concept</TooltipContent>
          )}
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="ml-auto inline-flex">
              <Button
                data-mission-auto-grid-open
                variant="ghost"
                size="icon"
                disabled={!isMissionOnly(missionType)}
                onClick={onAutoGrid}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {isMissionOnly(missionType) ? "Auto Grid" : "Auto Grid is only available in Mission mode"}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
