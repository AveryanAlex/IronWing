import {
  Upload, Download, Trash2,
  Plus, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, X, SkipForward,
  Grid3X3,
} from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import type { useMission } from "../../hooks/use-mission";

type MissionWorkspaceHeaderProps = {
  mission: ReturnType<typeof useMission>;
  connected: boolean;
  onAutoGrid?: () => void;
};

const isMissionOnly = (tab: string) => tab === "mission";

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

export function MissionWorkspaceHeader({ mission, connected, onAutoGrid }: MissionWorkspaceHeaderProps) {
  const current = mission.current;

  return (
    <div data-mission-workspace-header className="space-y-1">
      <div className="flex items-center gap-2">
        <select
          value={mission.selectedTab}
          onChange={(e) => mission.selectTab(e.target.value as typeof mission.selectedTab)}
          className="rounded-md border border-border bg-bg-input pl-2.5 pr-7 py-1.5 text-sm font-medium text-text-primary"
        >
          {mission.tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>{tab.label}</option>
          ))}
        </select>

        {current.isDirty && (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
            Modified
          </span>
        )}

        {current.recoverableAvailable && (
          <Button variant="secondary" size="sm" onClick={current.recoverDraft}>
            Recover Draft
          </Button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" disabled={current.transferUi.active || !connected} onClick={current.upload}>
            <Upload className="h-3.5 w-3.5" /> Write
          </Button>
          <Button size="sm" disabled={current.transferUi.active || !connected} onClick={current.download}>
            <Download className="h-3.5 w-3.5" /> Read
          </Button>
          <Button variant="destructive" size="sm" disabled={current.transferUi.active || !connected} onClick={current.clear}>
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0.5">
          <IconButton icon={<Plus className="h-3.5 w-3.5" />} label="Add Waypoint" onClick={current.addWaypoint} />
          <IconButton icon={<ChevronLeft className="h-3.5 w-3.5" />} label="Insert Before"
            onClick={() => current.insertBefore(current.selectedIndex ?? current.displayTotal)} />
          <IconButton icon={<ChevronRight className="h-3.5 w-3.5" />} label="Insert After"
            onClick={() => current.insertAfter(current.selectedIndex ?? current.displayTotal - 1)} />
          <IconButton icon={<X className="h-3.5 w-3.5" />} label="Delete Selected"
            onClick={() => current.deleteAt(current.selectedIndex ?? current.displayTotal - 1)}
            disabled={current.displayTotal === 0} />
        </div>

        <div className="mx-0.5 h-4 w-px bg-border" />

        <div className="flex items-center gap-0.5">
          <IconButton icon={<ArrowUp className="h-3.5 w-3.5" />} label="Move Up"
            onClick={() => { if (current.selectedIndex !== null) current.moveUp(current.selectedIndex); }}
            disabled={current.selectedIndex === null || current.selectedIndex <= 0} />
          <IconButton icon={<ArrowDown className="h-3.5 w-3.5" />} label="Move Down"
            onClick={() => { if (current.selectedIndex !== null) current.moveDown(current.selectedIndex); }}
            disabled={current.selectedIndex === null || current.selectedIndex >= Math.max(0, current.displayTotal - 1)} />
        </div>

        <div className="mx-0.5 h-4 w-px bg-border" />

        <Button variant="ghost" size="sm" onClick={current.validate}>Validate</Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                variant="ghost"
                size="sm"
                disabled={!connected || current.selectedIndex === null || !isMissionOnly(current.tab)}
                onClick={() => mission.mission.setCurrent()}
              >
                <SkipForward className="h-3.5 w-3.5" /> Set Current
              </Button>
            </span>
          </TooltipTrigger>
          {!isMissionOnly(current.tab) && (
            <TooltipContent>Set Current is only available in Mission mode</TooltipContent>
          )}
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                variant="ghost"
                size="sm"
                disabled={!isMissionOnly(current.tab)}
                onClick={current.updateHomeFromVehicle}
              >
                Home from Vehicle
              </Button>
            </span>
          </TooltipTrigger>
          {!isMissionOnly(current.tab) && (
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
                disabled={!isMissionOnly(current.tab)}
                onClick={onAutoGrid}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {isMissionOnly(current.tab) ? "Auto Grid" : "Auto Grid is only available in Mission mode"}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
