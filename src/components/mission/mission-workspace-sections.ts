import type { ReplayMapOverlayState } from "../../lib/replay-map-overlay";
import type { MissionTerrainState } from "../../lib/mission-terrain-state";
import type { Settings } from "../../lib/stores/settings";
import type {
  MissionPlannerAttachmentState,
  MissionPlannerFenceSelection,
  MissionPlannerFenceMutationResult,
  MissionPlannerMapMoveResult,
  MissionPlannerRallySelection,
  MissionPlannerRallyMutationResult,
  MissionPlannerStoreState,
} from "../../lib/stores/mission-planner";
import type { MissionPlannerSelectedSurveyView, MissionPlannerSurveyPromptView, MissionPlannerView } from "../../lib/stores/mission-planner-view";
import type { SurveyPatternType, SurveyRegion } from "../../lib/survey-region";
import type { TypedDraftItem } from "../../lib/mission-draft-typed";
import type { MissionMapView } from "../../lib/mission-map-view";
import type { FenceRegion, GeoPoint2d, GeoPoint3d, HomePosition, MissionCommand } from "../../lib/mavkit-types";
import type { FenceRegionType } from "../../lib/mission-draft-typed";

export type MissionWorkspaceVehiclePosition = GeoPoint2d & {
  heading_deg?: number | null;
};

export type MissionWorkspaceSurveyBlock = {
  regionId: string;
  position: number;
  region: SurveyRegion;
};

export type MissionWorkspaceContext = {
  planner: MissionPlannerStoreState;
  view: MissionPlannerView;
  appSettings: Settings;
  missionItems: TypedDraftItem[];
  fenceItems: TypedDraftItem[];
  rallyItems: TypedDraftItem[];
  fenceRegions: FenceRegion[];
  rallyPoints: GeoPoint3d[];
  fenceReturnPoint: GeoPoint2d | null;
  selectedMissionUiId: number | null;
  selectedMissionItem: TypedDraftItem | null;
  previousMissionItem: TypedDraftItem | null;
  selectedFenceItem: TypedDraftItem | null;
  selectedRallyItem: TypedDraftItem | null;
  selectedSurveyRegion: SurveyRegion | null;
  surveyPrompt: MissionPlannerSurveyPromptView | null;
  surveyBlocks: MissionWorkspaceSurveyBlock[];
  homeSelected: boolean;
  terrain: MissionTerrainState;
  mapView: MissionMapView;
  sessionHomePosition: GeoPoint2d | null;
  sessionVehiclePosition: MissionWorkspaceVehiclePosition | null;
  sessionVehicleHeadingDeg: number | null;
  replayMapOverlay: ReplayMapOverlayState | null;
};

export type MissionWorkspaceActions = {
  onSetHome: (home: HomePosition | null) => void;
  onSelectHome: () => void;
  onAddMissionItem: () => void;
  onDeleteMissionItem: (index: number) => void;
  onUpdateMissionItemAltitude: (index: number, altitudeM: number) => void;
  onUpdateMissionItemCommand: (index: number, command: MissionCommand) => void;
  onUpdateMissionItemLatitude: (index: number, latitudeDeg: number) => void;
  onUpdateMissionItemLongitude: (index: number, longitudeDeg: number) => void;
  onMoveMissionItemUp: (index: number) => void;
  onMoveMissionItemDown: (index: number) => void;
  onSelectMissionItem: (index: number) => void;
  onSelectMissionItemByUiId: (uiId: number) => void;
  onAddWaypointAt: (latitudeDeg: number, longitudeDeg: number) => void;
  onMoveMissionItemFromMap: (uiId: number, latitudeDeg: number, longitudeDeg: number) => MissionPlannerMapMoveResult;
  onSetHomeAt: (latitudeDeg: number, longitudeDeg: number) => void;
  onMoveHomeFromMap: (latitudeDeg: number, longitudeDeg: number) => MissionPlannerMapMoveResult;
  onCreateSurveyBlock: (patternType: SurveyPatternType) => string;
  onStartSurveyDraw: (patternType: SurveyPatternType) => string;
  onDeleteSurveyRegion: (regionId: string) => void;
  onGenerateSurveyRegion: (regionId: string) => Promise<unknown> | unknown;
  onPromptDissolveSurveyRegion: (regionId: string) => void;
  onSelectSurveyRegion: (regionId: string) => void;
  onSetSurveyRegionCollapsed: (regionId: string, collapsed: boolean) => void;
  onUpdateSurveyRegion: (regionId: string, updater: (region: SurveyRegion) => SurveyRegion) => void;
  onMarkSurveyRegionItemAsEdited: (regionId: string, itemIndex: number, editedItem: import("../../lib/mavkit-types").MissionItem) => void;
  onConfirmSurveyPrompt: () => void;
  onDismissSurveyPrompt: () => void;
  onPersistPlanningSpeeds: (args: { cruiseSpeed?: number; hoverSpeed?: number }) => void;
  onSetPlanningSpeeds: (speeds: { cruiseSpeed?: number; hoverSpeed?: number }) => void;
  onRetryTerrain: () => void | Promise<void>;
  onSelectTerrainWarning: (index: number) => void;
  onAddFenceRegion: (type: FenceRegionType, latitudeDeg?: number, longitudeDeg?: number) => MissionPlannerFenceMutationResult | unknown;
  onDeleteFenceRegion: (uiId: number) => MissionPlannerFenceMutationResult | unknown;
  onSelectFenceRegion: (uiId: number) => MissionPlannerFenceMutationResult | unknown;
  onSelectFenceReturnPoint: () => MissionPlannerFenceMutationResult | unknown;
  onUpdateFenceRegion: (uiId: number, region: FenceRegion) => MissionPlannerFenceMutationResult | unknown;
  onSetFenceReturnPoint: (point: GeoPoint2d | null) => MissionPlannerFenceMutationResult | unknown;
  onMoveFenceVertexFromMap: (uiId: number, index: number, latitudeDeg: number, longitudeDeg: number) => MissionPlannerFenceMutationResult | unknown;
  onMoveFenceCircleCenterFromMap: (uiId: number, latitudeDeg: number, longitudeDeg: number) => MissionPlannerFenceMutationResult | unknown;
  onUpdateFenceCircleRadiusFromMap: (uiId: number, radiusM: number) => MissionPlannerFenceMutationResult | unknown;
  onAddRallyPoint: () => MissionPlannerRallyMutationResult | unknown;
  onDeleteRallyPoint: (uiId: number) => MissionPlannerRallyMutationResult | unknown;
  onMoveRallyPointUp: (uiId: number) => MissionPlannerRallyMutationResult | unknown;
  onMoveRallyPointDown: (uiId: number) => MissionPlannerRallyMutationResult | unknown;
  onSelectRallyPoint: (uiId: number) => MissionPlannerRallyMutationResult | unknown;
  onUpdateRallyLatitude: (uiId: number, latitudeDeg: number) => MissionPlannerRallyMutationResult | unknown;
  onUpdateRallyLongitude: (uiId: number, longitudeDeg: number) => MissionPlannerRallyMutationResult | unknown;
  onUpdateRallyAltitude: (uiId: number, altitudeM: number) => MissionPlannerRallyMutationResult | unknown;
  onUpdateRallyAltitudeFrame: (uiId: number, frame: string) => MissionPlannerRallyMutationResult | unknown;
  onMoveRallyPointFromMap: (uiId: number, latitudeDeg: number, longitudeDeg: number) => MissionPlannerMapMoveResult;
};

export type MissionWorkspacePhoneState = {
  missionMapVisible: boolean;
  missionPlanVisible: boolean;
  missionPhoneSegment: "map" | "plan";
};

export type MissionWorkspaceHomeCardProps = {
  attachment: MissionPlannerAttachmentState;
  home: HomePosition | null;
  mode: MissionPlannerView["mode"];
  selected: boolean;
};

export type MissionWorkspaceFenceEditorProps = {
  fenceSelection: MissionPlannerFenceSelection;
  selectedFenceItem: TypedDraftItem | null;
  returnPoint: GeoPoint2d | null;
};

export type MissionWorkspaceRallyEditorProps = {
  rallySelection: MissionPlannerRallySelection;
  selectedRallyItem: TypedDraftItem | null;
};

export type MissionWorkspaceSelectedSurveyProps = {
  selectedSurvey: MissionPlannerSelectedSurveyView | null;
};
