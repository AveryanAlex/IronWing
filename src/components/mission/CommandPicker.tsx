import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import { commandDisplayNameFromVariant } from "../../lib/mavkit-types";

// Variant lists match the union types in mavkit-types.ts exactly.
// Nav: position-bearing first, then position-less.
const NAV_COMMANDS = [
  "Waypoint", "SplineWaypoint", "ArcWaypoint", "Takeoff", "Land",
  "LoiterUnlimited", "LoiterTurns", "LoiterTime", "LoiterToAlt",
  "ContinueAndChangeAlt", "VtolTakeoff", "VtolLand", "PayloadPlace",
  "ReturnToLaunch", "Delay", "GuidedEnable", "AltitudeWait",
  "SetYawSpeed", "ScriptTime", "AttitudeTime",
] as const;

const DO_COMMANDS = [
  "Jump", "JumpTag", "Tag", "PauseContinue",
  "ChangeSpeed", "SetReverse",
  "SetHome", "LandStart", "ReturnPathStart", "GoAround",
  "SetRoiLocation", "SetRoi", "SetRoiNone",
  "MountControl", "GimbalManagerPitchYaw",
  "CamTriggerDistance", "ImageStartCapture", "ImageStopCapture",
  "VideoStartCapture", "VideoStopCapture",
  "SetCameraZoom", "SetCameraFocus", "SetCameraSource",
  "DigicamConfigure", "DigicamControl",
  "SetServo", "SetRelay", "RepeatServo", "RepeatRelay",
  "FenceEnable", "Parachute", "Gripper", "Sprayer", "Winch",
  "EngineControl", "InvertedFlight",
  "AutotuneEnable", "VtolTransition", "GuidedLimits",
  "SetResumeRepeatDist", "AuxFunction", "SendScriptMessage",
] as const;

const CONDITION_COMMANDS = [
  "Delay", "Distance", "Yaw",
] as const;

type CommandPickerCategory = "Nav" | "Do" | "Condition";

export type CommandPickerProps = {
  currentName: string;
  onSelect: (category: CommandPickerCategory, variant: string) => void;
  disabled?: boolean;
};

const CATEGORY_LABEL_CLASS: Record<CommandPickerCategory, string> = {
  Nav: "text-accent",
  Do: "text-warning",
  Condition: "text-purple-400",
};

const CATEGORY_DISPLAY: Record<CommandPickerCategory, string> = {
  Nav: "Navigation",
  Do: "Actions",
  Condition: "Conditions",
};

type GroupConfig = {
  category: CommandPickerCategory;
  variants: readonly string[];
};

const GROUPS: GroupConfig[] = [
  { category: "Nav", variants: NAV_COMMANDS },
  { category: "Do", variants: DO_COMMANDS },
  { category: "Condition", variants: CONDITION_COMMANDS },
];

export function CommandPicker({ currentName, onSelect, disabled }: CommandPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className="flex items-center gap-1 rounded border border-border bg-bg-input px-1.5 py-1 text-xs text-text-primary disabled:opacity-50"
      >
        {currentName}
        <ChevronDown className="h-3 w-3 text-text-muted" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="max-h-[60vh] overflow-y-auto"
        align="start"
      >
        {GROUPS.map((group, gi) => (
          <div key={group.category}>
            {gi > 0 && <DropdownMenuSeparator />}
            <div className={`px-2 pb-0.5 pt-1.5 text-[9px] font-semibold uppercase tracking-wider ${CATEGORY_LABEL_CLASS[group.category]}`}>
              {CATEGORY_DISPLAY[group.category]}
            </div>
            {group.variants.map((variant) => (
              <DropdownMenuItem
                key={`${group.category}-${variant}`}
                className="rounded-md px-2 py-1 text-xs text-text-primary hover:bg-bg-tertiary"
                onSelect={() => onSelect(group.category, variant)}
              >
                {commandDisplayNameFromVariant(variant)}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
