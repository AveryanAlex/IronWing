<script lang="ts">
import { Monitor, Search, SlidersHorizontal } from "lucide-svelte";

import type { ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import type {
  ArduPilotOsdModel,
  OsdGridModel,
  OsdItemModel,
  OsdScreenModel,
} from "../../../../lib/osd/ardupilot-osd-model";
import { clampOsdCoordinate } from "../../../../lib/osd/ardupilot-osd-model";
import {
  OSD_TYPE_ANALOG,
  OSD_TYPE_DISPLAYPORT,
  OSD_TYPE_MSP,
} from "../../../../lib/osd/ardupilot-osd-setup";
import {
  osdDisplayTargetCompatibility,
  osdDisplayTargetLabel,
  type OsdDisplayTargetSelection,
} from "../../../../lib/osd/osd-display-target";
import {
  createOsdRenderContext,
  osdFootprintsOverlap,
  renderArduPilotOsdItem,
  renderArduPilotOsdScreen,
  type OsdFootprint,
  type OsdRenderSource,
} from "../../../../lib/osd/ardupilot-osd-renderer";
import {
  captureOsdGrabOffset,
  osdDropToGrid,
  osdPointerToGrid,
  type OsdGrabOffset,
  type OsdGridPoint,
} from "../../../../lib/osd/osd-placement";
import { Button, Checkbox, EmptyState, Input, InternalLink, NativeSelect, SegmentedControl } from "../../../../components/ui";
import SetupSectionCard from "../../shared/SetupSectionCard.svelte";
import SetupStatusPill from "../../shared/SetupStatusPill.svelte";
import { setupWorkspaceTestIds } from "../../setup-workspace-test-ids";
import OsdItemChip from "./OsdItemChip.svelte";
import OsdGlyphCanvas from "./OsdGlyphCanvas.svelte";

type OsdEditorMode = "live" | "cards";
type FrameAspectMode = "auto" | "16:9" | "4:3";
type ResolvedFrameAspect = Exclude<FrameAspectMode, "auto">;
type AnalogVideoStandard = "pal" | "ntsc";
type AnalogWidePresentation = "stretch" | "pillarbox";

type Props = {
  model: ArduPilotOsdModel;
  selectedScreen: number | null;
  disabled?: boolean;
  itemIndex: Map<string, ParameterItemModel>;
  previewSource?: OsdRenderSource;
  displayTarget: OsdDisplayTargetSelection | null;
  onSelectScreen: (screen: number) => void;
  onStageParam: (name: string, value: number) => void;
};

type OsdDragSource = "library" | "grid";
type OsdDropTarget = "grid" | "library" | null;
type PointerDragSession = {
  key: string;
  screen: number;
  pointerId: number;
  source: OsdDragSource;
  originClientX: number;
  originClientY: number;
  active: boolean;
  grab: OsdGrabOffset | null;
  preview: OsdGridPoint | null;
  dropTarget: OsdDropTarget;
  canMove: boolean;
  canRemove: boolean;
};

const DRAG_ACTIVATION_PX = 4;
const EDITOR_MODE_STORAGE_KEY = "ironwing.setup.osd.editor_mode";
const FRAME_ASPECT_STORAGE_KEY = "ironwing.setup.osd.frame_aspect";
const ANALOG_STANDARD_STORAGE_KEY = "ironwing.setup.osd.analog_standard";
const ANALOG_WIDE_PRESENTATION_STORAGE_KEY = "ironwing.setup.osd.analog_wide_presentation";
const ANALOG_GRIDS: Record<AnalogVideoStandard, OsdGridModel> = {
  pal: { columns: 30, rows: 16, label: "PAL 30 x 16" },
  ntsc: { columns: 30, rows: 13, label: "NTSC 30 x 13" },
};
const EMPTY_PREVIEW_SOURCE: OsdRenderSource = {
  telemetry: {},
  vehicleState: null,
  homePosition: null,
  statusMessage: null,
  connected: false,
  paramValues: {},
};
const EDITOR_MODE_OPTIONS = [
  { value: "live", label: "Pilot preview", testId: setupWorkspaceTestIds.osdPilotMode },
  { value: "cards", label: "Cards", testId: setupWorkspaceTestIds.osdCardsMode },
] as const;
const FRAME_ASPECT_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "16:9", label: "16:9" },
  { value: "4:3", label: "4:3" },
] as const;
const ANALOG_STANDARD_OPTIONS = [
  { value: "pal", label: "PAL · 30×16" },
  { value: "ntsc", label: "NTSC · 30×13" },
] as const;
const ANALOG_WIDE_PRESENTATION_OPTIONS = [
  { value: "stretch", label: "Stretch" },
  { value: "pillarbox", label: "Pillarbox" },
] as const;

let {
  model,
  selectedScreen,
  disabled = false,
  itemIndex,
  previewSource = EMPTY_PREVIEW_SOURCE,
  displayTarget,
  onSelectScreen,
  onStageParam,
}: Props = $props();

let pointerDrag = $state.raw<PointerDragSession | null>(null);
let librarySearch = $state("");
let editorMode = $state<OsdEditorMode>(loadEditorMode());
let frameAspectMode = $state<FrameAspectMode>(loadFrameAspectMode());
let analogVideoStandard = $state<AnalogVideoStandard>(loadAnalogVideoStandard());
let analogWidePresentation = $state<AnalogWidePresentation>(loadAnalogWidePresentation());
let renderClockMs = $state(Date.now());
let atlasError = $state<string | null>(null);
let hoveredLiveItemKey = $state<string | null>(null);
let focusedLiveItemKey = $state<string | null>(null);
let gridElement = $state<HTMLElement | null>(null);
let libraryElement = $state<HTMLElement | null>(null);
let dragCaptureElement: HTMLElement | null = null;
let suppressLibraryClickKey: string | null = null;

let activeScreen = $derived.by(() => {
  if (model.screens.length === 0) {
    return null;
  }

  return model.screens.find((screen) => screen.screen === selectedScreen) ?? model.screens[0] ?? null;
});
let osdType = $derived(normalizeOsdType(previewSource.paramValues.OSD_TYPE));
let isAnalog = $derived(osdType === OSD_TYPE_ANALOG);
let isDisplayPort = $derived(osdType === OSD_TYPE_DISPLAYPORT);
let isDigital = $derived(osdType === OSD_TYPE_MSP || osdType === OSD_TYPE_DISPLAYPORT);
let displayTargetCompatibility = $derived(
  osdDisplayTargetCompatibility(displayTarget, activeScreen?.txtResValue ?? null),
);
let coordinateEditingBlocked = $derived(
  isDisplayPort && displayTargetCompatibility !== "verified",
);
let activeEditorGrid = $derived(activeScreen ? editorGridForScreen(activeScreen) : model.grid);
let resolvedFrameAspect = $derived.by<ResolvedFrameAspect>(() => {
  if (frameAspectMode !== "auto") {
    return frameAspectMode;
  }
  if (isAnalog) {
    return "4:3";
  }
  if (isDigital) {
    return "16:9";
  }
  return activeEditorGrid.columns >= 50 ? "16:9" : "4:3";
});
let analogIsPillarboxed = $derived(
  isAnalog && resolvedFrameAspect === "16:9" && analogWidePresentation === "pillarbox",
);
let screenOptions = $derived(
  model.screens.map((screen) => ({
    value: String(screen.screen),
    label: `${screen.label} - ${screenStatus(screen)}`,
  })),
);
let libraryItems = $derived(activeScreen?.items.filter((item) => !item.enabled) ?? []);
let placedItems = $derived(activeScreen?.enabledItems ?? []);
let filteredLibraryItems = $derived.by(() => {
  if (!activeScreen) {
    return [];
  }

  const query = librarySearch.trim().toLocaleLowerCase();
  return [...libraryItems]
    .filter((item) => itemSearchText(item, activeScreen).includes(query))
    .sort((left, right) => itemDisplayLabel(left).localeCompare(itemDisplayLabel(right)));
});
let renderContext = $derived(createOsdRenderContext({ ...previewSource, nowMs: renderClockMs }));
let renderPlacements = $derived.by(() => {
  if (!activeScreen) {
    return [];
  }

  const placements = placedItems.map((item) => ({ key: item.key, ...gridPointForItem(item) }));
  if (
    pointerDrag?.active
    && pointerDrag.source === "library"
    && pointerDrag.dropTarget === "grid"
    && pointerDrag.preview
  ) {
    placements.push({ key: pointerDrag.key, ...pointerDrag.preview });
  }
  return placements;
});
let screenRender = $derived.by(() => activeScreen
  ? renderArduPilotOsdScreen({ placements: renderPlacements, grid: activeEditorGrid, context: renderContext })
  : { glyphs: [], items: new Map(), partialItemKeys: [] });
let outOfEditorGridItems = $derived(
  placedItems.filter((item) => itemIsOutOfEditorGrid(item, activeEditorGrid)),
);
let previewStatusText = $derived.by(() => {
  if (isDisplayPort && displayTargetCompatibility === "missing") {
    return "Display target required · fallback preview is read-only";
  }
  if (isDisplayPort && displayTargetCompatibility === "mismatch") {
    return "Pending target grid · coordinate editing is locked";
  }
  if (!previewSource.connected) {
    return "Partial preview · vehicle telemetry unavailable";
  }
  if (screenRender.partialItemKeys.length > 0) {
    return `Partial preview · ${screenRender.partialItemKeys.length} ${screenRender.partialItemKeys.length === 1 ? "item uses" : "items use"} placeholders`;
  }
  return "Live preview · all placed items have data";
});
let editorModeOptions = $derived(
  EDITOR_MODE_OPTIONS.map((option) => ({
    ...option,
    disabled: option.value === "live" && atlasError !== null,
  })),
);

$effect(() => {
  if (editorMode !== "live") {
    return;
  }

  renderClockMs = Date.now();
  const interval = window.setInterval(() => {
    renderClockMs = Date.now();
  }, 200);
  return () => window.clearInterval(interval);
});

function stageScreenEnabled(screen: OsdScreenModel, checked: boolean) {
  if (disabled || !screen.enableParamName || !isParamActionable(screen.enableParamName)) {
    return;
  }

  onStageParam(screen.enableParamName, checked ? 1 : 0);
}

function stageItemEnabled(item: OsdItemModel, checked: boolean) {
  if (disabled || !item.params.enable || !isParamActionable(item.params.enable)) {
    return;
  }

  onStageParam(item.params.enable, checked ? 1 : 0);
}

function stageItemDisabled(item: OsdItemModel) {
  stageItemEnabled(item, false);
  if (!coordinateEditingBlocked) {
    resetStagedCoordinates(item);
  }
}

function stagePosition(item: OsdItemModel, screen: OsdScreenModel, x: number, y: number) {
  if (disabled || coordinateEditingBlocked) {
    return;
  }

  const editorGrid = editorGridForScreen(screen);
  const nextX = clampOsdCoordinate(x, "x", editorGrid);
  const nextY = clampOsdCoordinate(y, "y", editorGrid);
  if (item.params.x && isParamActionable(item.params.x) && nextX !== item.x) {
    onStageParam(item.params.x, nextX);
  }
  if (item.params.y && isParamActionable(item.params.y) && nextY !== item.y) {
    onStageParam(item.params.y, nextY);
  }
}

function placeItem(item: OsdItemModel, screen: OsdScreenModel, x?: number, y?: number) {
  if (disabled || !canPlaceItem(item)) {
    return;
  }

  stageItemEnabled(item, true);
  const position = resolvePlacement(item, screen, x, y);
  stagePosition(item, screen, position.x, position.y);
}

function startPointerDrag(event: PointerEvent, item: OsdItemModel, screen: OsdScreenModel, source: OsdDragSource) {
  if (disabled || event.button !== 0 || pointerDrag) {
    return;
  }

  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const canMove = canMoveItem(item);
  const canRemove = isActionable(item, "enable");
  if (source === "library") {
    if (!canDragLibraryItem(item)) {
      return;
    }

    if (event.pointerType !== "mouse" && !isDragHandleTarget(event.target)) {
      return;
    }
  } else if (!canMove && !canRemove) {
    return;
  }

  const grab = source === "grid" && gridElement
    ? captureOsdGrabOffset({
        clientX: event.clientX,
        clientY: event.clientY,
        bounds: gridElement.getBoundingClientRect(),
        grid: editorGridForScreen(screen),
        item: { x: item.displayX, y: item.displayY },
      })
    : null;
  if (source === "grid" && !grab) {
    return;
  }

  pointerDrag = {
    key: item.key,
    screen: screen.screen,
    pointerId: event.pointerId,
    source,
    originClientX: event.clientX,
    originClientY: event.clientY,
    active: false,
    grab,
    preview: null,
    dropTarget: null,
    canMove,
    canRemove,
  };
  dragCaptureElement = target;
  target.setPointerCapture(event.pointerId);
}

function handlePointerMove(event: PointerEvent) {
  const session = pointerDrag;
  if (!session || session.pointerId !== event.pointerId) {
    return;
  }

  const distance = Math.hypot(
    event.clientX - session.originClientX,
    event.clientY - session.originClientY,
  );
  if (!session.active && distance < DRAG_ACTIVATION_PX) {
    return;
  }

  event.preventDefault();
  const location = resolveDragLocation(session, event.clientX, event.clientY);
  pointerDrag = {
    ...session,
    active: true,
    ...location,
  };
}

function handlePointerUp(event: PointerEvent) {
  const session = pointerDrag;
  if (!session || session.pointerId !== event.pointerId) {
    return;
  }

  const completed = session.active
    ? { ...session, ...resolveDragLocation(session, event.clientX, event.clientY) }
    : session;
  if (completed.active && completed.source === "library") {
    suppressLibraryClickKey = completed.key;
    setTimeout(() => {
      if (suppressLibraryClickKey === completed.key) {
        suppressLibraryClickKey = null;
      }
    }, 0);
  }
  clearPointerDrag(completed.active);
  if (completed.active) {
    hoveredLiveItemKey = null;
  }

  if (!completed.active || disabled) {
    return;
  }

  const screen = model.screens.find((candidate) => candidate.screen === completed.screen);
  const item = screen?.items.find((candidate) => candidate.key === completed.key);
  if (!screen || !item) {
    return;
  }

  if (completed.dropTarget === "grid" && completed.preview) {
    if (completed.source === "library") {
      placeItem(item, screen, completed.preview.x, completed.preview.y);
    } else if (completed.canMove) {
      stagePosition(item, screen, completed.preview.x, completed.preview.y);
    }
    return;
  }

  if (completed.source === "grid" && completed.dropTarget === "library" && completed.canRemove) {
    stageItemDisabled(item);
  }
}

function handlePointerCancel(event: PointerEvent) {
  if (pointerDrag?.pointerId === event.pointerId) {
    hoveredLiveItemKey = null;
    clearPointerDrag(true);
  }
}

function handleLostPointerCapture(event: PointerEvent) {
  if (pointerDrag?.pointerId === event.pointerId) {
    hoveredLiveItemKey = null;
    pointerDrag = null;
    dragCaptureElement = null;
  }
}

function clearPointerDrag(blurCapture = false) {
  const session = pointerDrag;
  const captureElement = dragCaptureElement;
  pointerDrag = null;
  dragCaptureElement = null;
  if (session && captureElement?.hasPointerCapture(session.pointerId)) {
    captureElement.releasePointerCapture(session.pointerId);
  }
  if (blurCapture) {
    captureElement?.blur();
  }
}

function resolveDragLocation(
  session: PointerDragSession,
  clientX: number,
  clientY: number,
): Pick<PointerDragSession, "dropTarget" | "preview"> {
  const screen = model.screens.find((candidate) => candidate.screen === session.screen);
  if (!screen) {
    return { dropTarget: null, preview: null };
  }

  if (gridElement && pointInsideElement(clientX, clientY, gridElement)) {
    if (session.source === "grid" && !session.canMove) {
      return { dropTarget: null, preview: null };
    }

    const bounds = gridElement.getBoundingClientRect();
    const editorGrid = editorGridForScreen(screen);
    const preview = session.source === "grid" && session.grab
      ? osdPointerToGrid({ clientX, clientY, bounds, grid: editorGrid, grab: session.grab })
      : osdDropToGrid({ clientX, clientY, bounds, grid: editorGrid });
    return preview ? { dropTarget: "grid", preview } : { dropTarget: null, preview: null };
  }

  if (
    session.source === "grid"
    && session.canRemove
    && libraryElement
    && pointInsideElement(clientX, clientY, libraryElement)
  ) {
    return { dropTarget: "library", preview: null };
  }

  return { dropTarget: null, preview: null };
}

function pointInsideElement(clientX: number, clientY: number, element: HTMLElement): boolean {
  const bounds = element.getBoundingClientRect();
  return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom;
}

function isDragHandleTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-osd-drag-handle]") !== null;
}

function handleLibraryClick(event: MouseEvent, item: OsdItemModel, screen: OsdScreenModel) {
  if (suppressLibraryClickKey === item.key) {
    suppressLibraryClickKey = null;
    event.preventDefault();
    return;
  }

  placeItem(item, screen);
}

function handleGridKeydown(event: KeyboardEvent, item: OsdItemModel, screen: OsdScreenModel) {
  if (event.key === "Delete" || event.key === "Backspace") {
    if (isActionable(item, "enable")) {
      event.preventDefault();
      stageItemDisabled(item);
    }
    return;
  }

  if (!canMoveItem(item)) {
    return;
  }

  const movement: Partial<Record<"ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown", OsdGridPoint>> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
  };
  const delta = movement[event.key as keyof typeof movement];
  if (!delta) {
    return;
  }

  event.preventDefault();
  stagePosition(item, screen, item.displayX + delta.x, item.displayY + delta.y);
}

function selectScreen(screen: number) {
  clearPointerDrag();
  hoveredLiveItemKey = null;
  focusedLiveItemKey = null;
  onSelectScreen(screen);
}

function loadEditorMode(): OsdEditorMode {
  return loadStoredChoice(EDITOR_MODE_STORAGE_KEY, ["live", "cards"], "live");
}

function loadFrameAspectMode(): FrameAspectMode {
  return loadStoredChoice(FRAME_ASPECT_STORAGE_KEY, ["auto", "16:9", "4:3"], "auto");
}

function loadAnalogVideoStandard(): AnalogVideoStandard {
  return loadStoredChoice(ANALOG_STANDARD_STORAGE_KEY, ["pal", "ntsc"], "pal");
}

function loadAnalogWidePresentation(): AnalogWidePresentation {
  return loadStoredChoice(ANALOG_WIDE_PRESENTATION_STORAGE_KEY, ["stretch", "pillarbox"], "stretch");
}

function loadStoredChoice<T extends string>(key: string, choices: readonly T[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return choices.find((choice) => choice === stored) ?? fallback;
  } catch {
    return fallback;
  }
}

function persistChoice(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The in-memory choice remains usable when persistence is unavailable.
  }
}

function selectEditorMode(value: string) {
  if (value !== "live" && value !== "cards") {
    return;
  }
  if (value === "live" && atlasError) {
    return;
  }

  clearPointerDrag();
  hoveredLiveItemKey = null;
  focusedLiveItemKey = null;
  editorMode = value;
  persistChoice(EDITOR_MODE_STORAGE_KEY, value);
}

function selectFrameAspectMode(value: string) {
  if (value !== "auto" && value !== "16:9" && value !== "4:3") {
    return;
  }

  resetGeometryInteraction();
  frameAspectMode = value;
  persistChoice(FRAME_ASPECT_STORAGE_KEY, value);
}

function selectAnalogVideoStandard(value: string) {
  if (value !== "pal" && value !== "ntsc") {
    return;
  }

  resetGeometryInteraction();
  analogVideoStandard = value;
  persistChoice(ANALOG_STANDARD_STORAGE_KEY, value);
}

function selectAnalogWidePresentation(value: string) {
  if (value !== "stretch" && value !== "pillarbox") {
    return;
  }

  resetGeometryInteraction();
  analogWidePresentation = value;
  persistChoice(ANALOG_WIDE_PRESENTATION_STORAGE_KEY, value);
}

function resetGeometryInteraction() {
  clearPointerDrag();
  hoveredLiveItemKey = null;
  focusedLiveItemKey = null;
}

function handleAtlasError(message: string | null) {
  if (!message) {
    return;
  }

  atlasError = message;
  editorMode = "cards";
}

function screenStatus(screen: OsdScreenModel): string {
  const enabled = screen.enabledItems.length;
  const state = screen.enabled === false ? "screen off" : `${enabled} enabled`;
  return `${state} / ${screen.items.length} detected`;
}

function isParamActionable(name: string): boolean {
  return !disabled && itemIndex.get(name)?.readOnly !== true;
}

function isActionable(item: OsdItemModel, role: "enable" | "x" | "y"): boolean {
  const paramName = item.params[role];
  return paramName !== null && isParamActionable(paramName);
}

function canPlaceItem(item: OsdItemModel): boolean {
  return !coordinateEditingBlocked && isActionable(item, "enable");
}

function canMoveItem(item: OsdItemModel): boolean {
  return !coordinateEditingBlocked && isActionable(item, "x") && isActionable(item, "y");
}

function canDragLibraryItem(item: OsdItemModel): boolean {
  return canPlaceItem(item) && canMoveItem(item);
}

function canInteractWithPlacedItem(item: OsdItemModel): boolean {
  return canMoveItem(item) || isActionable(item, "enable");
}

function resetStagedCoordinates(item: OsdItemModel) {
  resetStagedCoordinate(item, "x");
  resetStagedCoordinate(item, "y");
}

function resetStagedCoordinate(item: OsdItemModel, axis: "x" | "y") {
  if (!item.staged[axis]) {
    return;
  }

  const paramName = item.params[axis];
  const currentValue = paramName ? itemIndex.get(paramName)?.value : null;
  if (paramName && typeof currentValue === "number" && Number.isFinite(currentValue)) {
    onStageParam(paramName, currentValue);
  }
}

function itemDisplayLabel(item: OsdItemModel): string {
  const metadataLabel = item.params.enable ? itemIndex.get(item.params.enable)?.label : null;
  return normalizeMetadataLabel(metadataLabel, item) ?? item.label;
}

function itemParamSummary(item: OsdItemModel, screen: OsdScreenModel): string {
  return `OSD${screen.screen}_${item.key}`;
}

function itemSearchText(item: OsdItemModel, screen: OsdScreenModel): string {
  return [itemDisplayLabel(item), item.key, itemParamSummary(item, screen)].join(" ").toLocaleLowerCase();
}

function itemIsStaged(item: OsdItemModel): boolean {
  return item.staged.enable || item.staged.x || item.staged.y;
}

function itemDataAttributes(item: OsdItemModel) {
  return {
    "data-osd-key": item.key,
    "data-enable-param": item.params.enable ?? undefined,
    "data-x-param": item.params.x ?? undefined,
    "data-y-param": item.params.y ?? undefined,
  };
}

function normalizeOsdType(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function editorGridForScreen(screen: OsdScreenModel): OsdGridModel {
  return isAnalog ? ANALOG_GRIDS[analogVideoStandard] : screen.grid;
}

function itemIsOutOfEditorGrid(item: OsdItemModel, grid: OsdGridModel): boolean {
  return item.x < 0 || item.x >= grid.columns || item.y < 0 || item.y >= grid.rows;
}

function frameAspectStyle(): string {
  return resolvedFrameAspect === "16:9" ? "aspect-ratio: 16 / 9;" : "aspect-ratio: 4 / 3;";
}

function gridPlaneStyle(): string {
  return analogIsPillarboxed
    ? "inset-block: 0; left: 12.5%; width: 75%;"
    : "inset: 0;";
}

function gridPointForItem(item: OsdItemModel): OsdGridPoint {
  if (
    pointerDrag?.active
    && pointerDrag.source === "grid"
    && pointerDrag.key === item.key
    && pointerDrag.dropTarget === "grid"
    && pointerDrag.preview
  ) {
    return pointerDrag.preview;
  }

  return { x: item.displayX, y: item.displayY };
}

function gridFootprintStyle(point: OsdGridPoint, grid: OsdGridModel, footprint: OsdFootprint): string {
  const leftPct = ((point.x + footprint.minX) / grid.columns) * 100;
  const topPct = ((point.y + footprint.minY) / grid.rows) * 100;
  const widthPct = (footprint.width / grid.columns) * 100;
  const heightPct = (footprint.height / grid.rows) * 100;
  return `left: ${leftPct}%; top: ${topPct}%; width: ${widthPct}%; height: ${heightPct}%;`;
}

function itemMaximumFootprint(item: OsdItemModel): OsdFootprint {
  return screenRender.items.get(item.key)?.maxFootprint
    ?? renderArduPilotOsdItem(item.key, renderContext).maxFootprint;
}

function gridItemStyle(item: OsdItemModel, point: OsdGridPoint, screen: OsdScreenModel): string {
  return gridFootprintStyle(point, editorGridForScreen(screen), itemMaximumFootprint(item));
}

function liveHitCellStyle(x: number, y: number, screen: OsdScreenModel): string {
  const editorGrid = editorGridForScreen(screen);
  return [
    `left: ${(x / editorGrid.columns) * 100}%`,
    `top: ${(y / editorGrid.rows) * 100}%`,
    `width: ${(1 / editorGrid.columns) * 100}%`,
    `height: ${(1 / editorGrid.rows) * 100}%`,
  ].join("; ");
}

function visibleHitCells(item: OsdItemModel) {
  return screenRender.glyphs.filter((glyph) => glyph.ownerKey === item.key);
}

function liveItemIsOutlined(item: OsdItemModel): boolean {
  return (
    hoveredLiveItemKey === item.key
    || focusedLiveItemKey === item.key
    || (pointerDrag?.active === true && pointerDrag.source === "grid" && pointerDrag.key === item.key)
  );
}

function liveItemOutlineTone(item: OsdItemModel): "drag" | "inspect" {
  return pointerDrag?.active === true && pointerDrag.source === "grid" && pointerDrag.key === item.key
    ? "drag"
    : "inspect";
}

function gridChipAriaLabel(item: OsdItemModel): string {
  const actions = [
    canMoveItem(item) ? "Use arrow keys or drag to move" : null,
    isActionable(item, "enable") ? "Delete or drag to the library to remove" : null,
  ].filter(Boolean).join(". ");
  return `${itemDisplayLabel(item)} at X ${item.displayX}, Y ${item.displayY}${actions ? `. ${actions}` : ""}`;
}

function libraryChipAriaLabel(item: OsdItemModel): string {
  if (coordinateEditingBlocked) {
    return `${itemDisplayLabel(item)}. Coordinate editing is locked until the DisplayPort target matches TXT_RES`;
  }

  return canDragLibraryItem(item)
    ? `${itemDisplayLabel(item)}. Drag onto the grid or press to place automatically`
    : `${itemDisplayLabel(item)}. Press to enable at its stored position`;
}

function resolvePlacement(item: OsdItemModel, screen: OsdScreenModel, x?: number, y?: number): OsdGridPoint {
  const editorGrid = editorGridForScreen(screen);
  if (typeof x === "number" && typeof y === "number") {
    return {
      x: clampOsdCoordinate(x, "x", editorGrid),
      y: clampOsdCoordinate(y, "y", editorGrid),
    };
  }

  if (
    !itemIsOutOfEditorGrid(item, editorGrid)
    && isAutomaticPlacementInsideGrid(item, screen, item.x, item.y)
    && !isGridCellOccupied(item, screen, item.x, item.y)
  ) {
    return { x: item.x, y: item.y };
  }

  for (let row = 0; row < editorGrid.rows; row += 1) {
    for (let column = 0; column < editorGrid.columns; column += 1) {
      if (isAutomaticPlacementInsideGrid(item, screen, column, row) && !isGridCellOccupied(item, screen, column, row)) {
        return { x: column, y: row };
      }
    }
  }

  return {
    x: Math.floor(editorGrid.columns / 2),
    y: Math.floor(editorGrid.rows / 2),
  };
}

function isGridCellOccupied(item: OsdItemModel, screen: OsdScreenModel, x: number, y: number): boolean {
  const footprint = renderArduPilotOsdItem(item.key, renderContext).maxFootprint;
  return screen.enabledItems.some((candidate) => (
    candidate.key !== item.key
    && osdFootprintsOverlap(
      { x, y, footprint },
      {
        x: candidate.displayX,
        y: candidate.displayY,
        footprint: renderArduPilotOsdItem(candidate.key, renderContext).maxFootprint,
      },
    )
  ));
}

function isAutomaticPlacementInsideGrid(item: OsdItemModel, screen: OsdScreenModel, x: number, y: number): boolean {
  const footprint = renderArduPilotOsdItem(item.key, renderContext).maxFootprint;
  const editorGrid = editorGridForScreen(screen);
  return (
    x + footprint.minX >= 0
    && y + footprint.minY >= 0
    && x + footprint.minX + footprint.width <= editorGrid.columns
    && y + footprint.minY + footprint.height <= editorGrid.rows
  );
}

function normalizeMetadataLabel(label: string | null | undefined, item: OsdItemModel): string | null {
  const trimmed = label?.trim();
  if (!trimmed || trimmed === item.params.enable) {
    return null;
  }

  const withoutScreenPrefix = trimmed.replace(/^OSD\d+[_\s-]*/i, "");
  const rawish = /^[A-Z0-9_\s-]+$/.test(withoutScreenPrefix);
  const hasRoleSuffix = /[_\s-]*(EN|ENABLE|X|Y)$/i.test(withoutScreenPrefix);
  const normalized = rawish
    ? withoutScreenPrefix
      .replace(/[_\s-]*(EN|ENABLE|X|Y)$/i, "")
      .replace(/[_-]+/g, " ")
      .trim()
    : withoutScreenPrefix.replace(/[_-]+/g, " ").trim();

  if (normalized.length === 0 || normalized === item.key) {
    return null;
  }

  if (rawish && hasRoleSuffix && compactLabel(normalized) === compactLabel(item.key)) {
    return null;
  }

  return normalized;
}

function compactLabel(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function displayTargetWarningText(screen: OsdScreenModel): string {
  if (!displayTarget) {
    return "Display target required. The fallback preview is read-only until you select the connected DisplayPort device and stage its TXT_RES mode.";
  }

  const effectiveMode = screen.txtResValue === null ? "unavailable" : String(screen.txtResValue);
  return `Pending target grid. ${osdDisplayTargetLabel(displayTarget)} uses ${displayTarget.columns} × ${displayTarget.rows} and requires TXT_RES=${displayTarget.txtResMode}, but ${screen.label} currently resolves to ${effectiveMode}. Coordinate editing stays locked until the matching mode is current or staged.`;
}
</script>

<svelte:window
  onpointercancel={handlePointerCancel}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
/>

<SetupSectionCard
  icon={Monitor}
  title="OSD Layout"
  description="Edit ArduPilot OSD item visibility and character-grid positions. Changes are staged for review before apply."
  testId={setupWorkspaceTestIds.osdSummary}
>
  {#snippet status()}
    {#if model.hasOsdParams}
      <SetupStatusPill>{model.screens.length} {model.screens.length === 1 ? "screen" : "screens"}</SetupStatusPill>
    {/if}
  {/snippet}

  {#if !model.hasOsdParams}
    {#snippet emptyIcon()}
      <Monitor aria-hidden="true" size={28} />
    {/snippet}
    <EmptyState
      icon={emptyIcon}
      title="No OSD parameters detected"
      description="Download parameters from an ArduPilot vehicle with OSD support. IronWing detects OSDn_* item parameters from the loaded parameter store."
      testId={setupWorkspaceTestIds.osdEmpty}
    />
  {:else if activeScreen}
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label class="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-text-muted">
          Screen
          <NativeSelect
            value={String(activeScreen.screen)}
            options={screenOptions}
            class="normal-case tracking-normal"
            testId={setupWorkspaceTestIds.osdScreenSelect}
            onchange={(event) => selectScreen(Number(event.currentTarget.value))}
          />
        </label>

        <div class="flex flex-col items-start gap-2 sm:items-end">
          <SegmentedControl
            value={editorMode}
            options={editorModeOptions}
            ariaLabel="OSD editor display mode"
            size="sm"
            testId={setupWorkspaceTestIds.osdModeToggle}
            onValueChange={selectEditorMode}
          />
          <p class="text-xs text-text-muted">
            Frame {resolvedFrameAspect} · Grid {activeEditorGrid.label}. Drag items from the library, move placed items, or use the keyboard.
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-3 rounded-md border border-border bg-bg-secondary px-3 py-2">
        <label class="flex min-w-28 flex-1 flex-col gap-1 text-xs font-medium uppercase tracking-wide text-text-muted sm:max-w-40">
          Video frame
          <NativeSelect
            value={frameAspectMode}
            options={FRAME_ASPECT_OPTIONS}
            size="sm"
            class="normal-case tracking-normal"
            testId={setupWorkspaceTestIds.osdFrameAspectSelect}
            onchange={(event) => selectFrameAspectMode(event.currentTarget.value)}
          />
        </label>

        {#if isAnalog}
          <label class="flex min-w-36 flex-1 flex-col gap-1 text-xs font-medium uppercase tracking-wide text-text-muted sm:max-w-48">
            Analog standard
            <NativeSelect
              value={analogVideoStandard}
              options={ANALOG_STANDARD_OPTIONS}
              size="sm"
              class="normal-case tracking-normal"
              testId={setupWorkspaceTestIds.osdAnalogStandardSelect}
              onchange={(event) => selectAnalogVideoStandard(event.currentTarget.value)}
            />
          </label>

          {#if resolvedFrameAspect === "16:9"}
            <label class="flex min-w-32 flex-1 flex-col gap-1 text-xs font-medium uppercase tracking-wide text-text-muted sm:max-w-44">
              4:3 source in 16:9
              <NativeSelect
                value={analogWidePresentation}
                options={ANALOG_WIDE_PRESENTATION_OPTIONS}
                size="sm"
                class="normal-case tracking-normal"
                testId={setupWorkspaceTestIds.osdAnalogWidePresentationSelect}
                onchange={(event) => selectAnalogWidePresentation(event.currentTarget.value)}
              />
            </label>
          {/if}

          <p class="min-w-56 flex-[2] text-xs text-text-muted">
            ArduPilot writes the analog character grid; the receiver or goggles decide whether a 4:3 source is stretched or pillarboxed.
          </p>
        {:else}
          <p class="min-w-56 flex-[2] text-xs text-text-muted">
            {isDigital
              ? "DisplayPort provides the character grid; the display device decides the final video scaling."
              : "Auto infers the frame from the detected grid because the active OSD backend is unknown."}
          </p>
        {/if}
      </div>

      {#if coordinateEditingBlocked}
        <div
          class="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning"
          data-testid={setupWorkspaceTestIds.osdDisplayCompatibilityWarning}
        >
          {displayTargetWarningText(activeScreen)}
        </div>
      {/if}

      {#if activeScreen.enableParamName}
        <div class="rounded-md border border-border bg-bg-secondary px-3 py-2">
          <Checkbox
            checked={activeScreen.enabled ?? false}
            disabled={!isParamActionable(activeScreen.enableParamName)}
            label={`Enable ${activeScreen.label}`}
            description="This stages OSDn_ENABLE. Item edits remain available so you can prepare a disabled screen before enabling it."
            testId={`${setupWorkspaceTestIds.osdInputPrefix}-${activeScreen.enableParamName}`}
            onCheckedChange={(checked) => stageScreenEnabled(activeScreen, checked)}
          />
          {#if activeScreen.enabled === false}
            <p class="mt-2 text-xs text-warning">
              {activeScreen.label} is disabled on the vehicle. Position edits can be staged, but this screen will not appear until
              {activeScreen.enableParamName} is enabled.
            </p>
          {/if}
        </div>
      {:else}
        <div class="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-text-secondary">
          No OSDn_ENABLE parameter was loaded for {activeScreen.label}. Item layout can still be edited if item parameters are writable.
        </div>
      {/if}

      <div class="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div class="min-w-0">
          <p class="mb-2 font-mono text-[10px] uppercase tracking-wide text-text-muted">
            {activeScreen.label} · {activeEditorGrid.label} · {resolvedFrameAspect}
          </p>

          <div
            class="relative w-full min-w-0 overflow-hidden rounded-lg border border-border bg-black shadow-inner"
            data-testid={setupWorkspaceTestIds.osdFrame}
            data-frame-aspect-mode={frameAspectMode}
            data-frame-aspect={resolvedFrameAspect}
            style={frameAspectStyle()}
          >
            <div
              bind:this={gridElement}
              class={[
                "absolute overflow-hidden bg-black touch-none",
                analogIsPillarboxed && "border-x border-white/15",
                pointerDrag?.active && pointerDrag.dropTarget === "grid" && "ring-2 ring-inset ring-accent/70",
              ]}
              data-osd-grid
              data-testid={setupWorkspaceTestIds.osdGrid}
              role="region"
              aria-label={`${activeScreen.label} OSD placement grid`}
              style:--osd-columns={activeEditorGrid.columns}
              style:--osd-rows={activeEditorGrid.rows}
              data-grid-columns={activeEditorGrid.columns}
              data-grid-rows={activeEditorGrid.rows}
              data-grid-presentation={analogIsPillarboxed ? "pillarbox" : "stretch"}
              data-analog-standard={isAnalog ? analogVideoStandard : undefined}
              data-editor-mode={editorMode}
              style={gridPlaneStyle()}
            >
            {#if editorMode === "live"}
              <div class="pointer-events-none absolute inset-0">
                <OsdGlyphCanvas grid={activeEditorGrid} render={screenRender} onAtlasError={handleAtlasError} />
              </div>
            {/if}

            <div class="pointer-events-none absolute inset-0 z-[1] osd-grid-lines"></div>

            {#each placedItems as item (item.key)}
              {@const point = gridPointForItem(item)}
              {#if editorMode === "cards"}
                <OsdItemChip
                  mode="grid"
                  label={itemDisplayLabel(item)}
                  paramSummary={itemParamSummary(item, activeScreen)}
                  ariaLabel={gridChipAriaLabel(item)}
                  disabled={!canInteractWithPlacedItem(item)}
                  canDrag={canInteractWithPlacedItem(item)}
                  dragging={pointerDrag?.active && pointerDrag.source === "grid" && pointerDrag.key === item.key}
                  warning={itemIsOutOfEditorGrid(item, activeEditorGrid)}
                  staged={itemIsStaged(item)}
                  style={gridItemStyle(item, point, activeScreen)}
                  testId={`${setupWorkspaceTestIds.osdGridItemPrefix}-${activeScreen.screen}-${item.key}`}
                  {...itemDataAttributes(item)}
                  data-grid-x={point.x}
                  data-grid-y={point.y}
                  onkeydown={(event) => handleGridKeydown(event, item, activeScreen)}
                  onlostpointercapture={handleLostPointerCapture}
                  onpointerdown={(event) => startPointerDrag(event, item, activeScreen, "grid")}
                />
              {:else}
                <Button
                  variant="bare"
                  class="pointer-events-none absolute inset-0 z-10 size-full touch-none overflow-visible rounded-none border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-0"
                  ariaLabel={gridChipAriaLabel(item)}
                  disabled={!canInteractWithPlacedItem(item)}
                  title={`${itemDisplayLabel(item)} · ${itemParamSummary(item, activeScreen)}`}
                  testId={`${setupWorkspaceTestIds.osdGridItemPrefix}-${activeScreen.screen}-${item.key}`}
                  {...itemDataAttributes(item)}
                  data-mode="live"
                  data-grid-x={point.x}
                  data-grid-y={point.y}
                  data-current-glyph-count={visibleHitCells(item).length}
                  data-max-width={itemMaximumFootprint(item).width}
                  data-max-height={itemMaximumFootprint(item).height}
                  onblur={() => {
                    if (focusedLiveItemKey === item.key) focusedLiveItemKey = null;
                  }}
                  onfocus={() => focusedLiveItemKey = item.key}
                  onkeydown={(event) => handleGridKeydown(event, item, activeScreen)}
                  onlostpointercapture={handleLostPointerCapture}
                  onpointerenter={() => hoveredLiveItemKey = item.key}
                  onpointerleave={() => {
                    if (hoveredLiveItemKey === item.key && pointerDrag?.key !== item.key) hoveredLiveItemKey = null;
                  }}
                  onpointerdown={(event) => startPointerDrag(event, item, activeScreen, "grid")}
                >
                  {#each visibleHitCells(item) as glyph (`${glyph.x}:${glyph.y}`)}
                    <span
                      aria-hidden="true"
                      class={[
                        "absolute touch-none",
                        canInteractWithPlacedItem(item)
                          ? "pointer-events-auto cursor-grab active:cursor-grabbing"
                          : "pointer-events-none cursor-not-allowed",
                      ]}
                      data-osd-hit-cell
                      data-cell-x={glyph.x}
                      data-cell-y={glyph.y}
                      style={liveHitCellStyle(glyph.x, glyph.y, activeScreen)}
                    ></span>
                  {/each}
                </Button>

                {#if liveItemIsOutlined(item)}
                  <div
                    aria-hidden="true"
                    class={[
                      "pointer-events-none absolute z-20 rounded-sm border transition",
                      liveItemOutlineTone(item) === "drag"
                        ? "border-accent bg-accent/10 ring-2 ring-accent/70"
                        : "border-white/60 bg-white/5",
                      itemIsOutOfEditorGrid(item, activeEditorGrid) && "border-warning/70",
                    ]}
                    data-osd-max-outline
                    data-outline-tone={liveItemOutlineTone(item)}
                    style={gridItemStyle(item, point, activeScreen)}
                  ></div>
                {/if}
              {/if}
            {/each}

            {#if pointerDrag?.active && pointerDrag.source === "library" && pointerDrag.dropTarget === "grid" && pointerDrag.preview}
              {@const previewItem = activeScreen.items.find((item) => item.key === pointerDrag?.key)}
              {#if previewItem}
                {#if editorMode === "cards"}
                  <OsdItemChip
                    mode="grid"
                    label={itemDisplayLabel(previewItem)}
                    paramSummary={itemParamSummary(previewItem, activeScreen)}
                    ariaLabel={`Preview ${itemDisplayLabel(previewItem)}`}
                    preview
                    style={gridItemStyle(previewItem, pointerDrag.preview, activeScreen)}
                  />
                {:else}
                  <div
                    aria-hidden="true"
                    class="pointer-events-none absolute z-20 rounded-sm border border-accent bg-accent/10 ring-2 ring-accent/70"
                    style={gridItemStyle(previewItem, pointerDrag.preview, activeScreen)}
                  ></div>
                {/if}
              {/if}
            {/if}
            </div>
          </div>

          <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-text-muted">
            <span
              class={coordinateEditingBlocked || screenRender.partialItemKeys.length > 0 || !previewSource.connected ? "text-warning" : "text-success"}
              data-testid={setupWorkspaceTestIds.osdPreviewStatus}
              title={screenRender.partialItemKeys.length > 0 ? `Placeholders: ${screenRender.partialItemKeys.join(", ")}` : undefined}
            >
              {previewStatusText}
            </span>
            <span class="font-mono">Sneaky FPV · 36×54 glyphs</span>
          </div>

          {#if outOfEditorGridItems.length > 0}
            <p class="mt-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              {outOfEditorGridItems.length} {outOfEditorGridItems.length === 1 ? "item is" : "items are"} outside the
              {activeEditorGrid.label} grid and will be clipped by this video standard:
              {outOfEditorGridItems.map(itemDisplayLabel).join(", ")}.
            </p>
          {/if}

          {#if atlasError}
            <p class="mt-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              Pilot preview is unavailable: {atlasError} Cards mode remains fully editable.
            </p>
          {/if}
        </div>

        <div class="flex min-w-0 flex-col gap-3">
          <section
            bind:this={libraryElement}
            class={[
              "min-w-0 overflow-hidden rounded-lg border border-border bg-bg-primary",
              pointerDrag?.active && pointerDrag.dropTarget === "library" && "border-accent ring-2 ring-accent/35",
            ]}
            data-testid={setupWorkspaceTestIds.osdLibrary}
            aria-label={`${activeScreen.label} OSD item library`}
          >
            <div class="border-b border-border bg-bg-secondary px-3 py-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h3 class="text-xs font-semibold uppercase tracking-wide text-text-muted">Item library</h3>
                  <p class="mt-1 text-xs text-text-muted">Drag a chip onto the grid or press it to place automatically.</p>
                </div>
                <span class="shrink-0 text-xs tabular-nums text-text-muted">
                  {filteredLibraryItems.length}/{libraryItems.length}
                </span>
              </div>

              <label class="mt-3 flex items-center gap-2">
                <Search aria-hidden="true" class="shrink-0 text-text-muted" size={14} />
                <span class="sr-only">Search OSD items</span>
                <Input
                  bind:value={librarySearch}
                  class="min-w-0"
                  placeholder="Search items or parameter names..."
                  size="sm"
                  testId={setupWorkspaceTestIds.osdLibrarySearch}
                  type="search"
                />
              </label>
            </div>

            <div class="grid max-h-[32rem] min-w-0 gap-2 overflow-y-auto p-3 sm:grid-cols-2 2xl:grid-cols-1">
              {#if filteredLibraryItems.length === 0}
                <p class="rounded-md border border-dashed border-border px-3 py-4 text-sm text-text-muted sm:col-span-2 2xl:col-span-1">
                  {libraryItems.length === 0
                    ? "Every detected item is currently placed."
                    : "No available items match this search."}
                </p>
              {:else}
                {#each filteredLibraryItems as item (item.key)}
                  <div class="grid min-w-0 gap-1">
                    <OsdItemChip
                      mode="library"
                      label={itemDisplayLabel(item)}
                      paramSummary={itemParamSummary(item, activeScreen)}
                      ariaLabel={libraryChipAriaLabel(item)}
                      disabled={!canPlaceItem(item)}
                      canDrag={canDragLibraryItem(item)}
                      dragging={pointerDrag?.active && pointerDrag.source === "library" && pointerDrag.key === item.key}
                      warning={!item.complete}
                      staged={itemIsStaged(item)}
                      testId={`${setupWorkspaceTestIds.osdLibraryItemPrefix}-${activeScreen.screen}-${item.key}`}
                      {...itemDataAttributes(item)}
                      onclick={(event) => handleLibraryClick(event, item, activeScreen)}
                      onlostpointercapture={handleLostPointerCapture}
                      onpointerdown={(event) => startPointerDrag(event, item, activeScreen, "library")}
                    />
                    <p class="truncate px-1 font-mono text-[10px] text-text-muted">{itemParamSummary(item, activeScreen)}</p>
                    {#if !item.complete}
                      <p class="px-1 text-[10px] text-warning">Partial parameter set; exact drag placement is unavailable.</p>
                    {/if}
                  </div>
                {/each}
              {/if}
            </div>
          </section>

          <InternalLink
            variant="card"
            class="min-h-10 px-3 py-2"
            data-sveltekit-preload-code="hover"
            data-sveltekit-preload-data="hover"
            testId={setupWorkspaceTestIds.osdAdvancedParametersLink}
            href={`/setup/parameters?search=${encodeURIComponent(`OSD${activeScreen.screen}_`)}&filter=all`}
          >
            <span class="inline-flex items-center gap-2">
              <SlidersHorizontal aria-hidden="true" class="text-accent" size={16} />
              Advanced {activeScreen.label} parameters
            </span>
            <span class="font-mono text-[10px] text-text-muted">OSD{activeScreen.screen}_*</span>
          </InternalLink>
        </div>
      </div>

      {#if disabled}
        <div class="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-text-secondary">
          OSD edits are locked until the setup checkpoint is resolved.
        </div>
      {/if}
    </div>
  {/if}
</SetupSectionCard>

<style>
  .osd-grid-lines {
    background-image:
      linear-gradient(to right, color-mix(in oklab, var(--color-border) 65%, transparent) 1px, transparent 1px),
      linear-gradient(to bottom, color-mix(in oklab, var(--color-border) 65%, transparent) 1px, transparent 1px);
    background-size: calc(100% / var(--osd-columns)) calc(100% / var(--osd-rows));
  }
</style>
