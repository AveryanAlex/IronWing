import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Crosshair,
  Map as MapIcon,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import {
  getBuiltinCameras,
  getCustomCameras,
  getRecentCameras,
  searchCameras,
  type CatalogCamera,
} from "../../lib/survey-camera-catalog";
import type { UseSurveyPlannerResult } from "../../hooks/use-survey-planner";
import { SurveyRegionCard } from "./SurveyRegionCard";

type SurveyPlannerPanelProps = {
  planner: UseSurveyPlannerResult;
};

type CustomCameraFormState = {
  brand: string;
  model: string;
  sensorWidth_mm: string;
  sensorHeight_mm: string;
  imageWidth_px: string;
  imageHeight_px: string;
  focalLength_mm: string;
  minTriggerInterval_s: string;
  defaultOrientation: "landscape" | "portrait";
  fixedOrientation: boolean;
};

const CAPTURE_MODE_LABELS = {
  distance: "Distance trigger",
  hover: "Hover capture",
} as const;

const PATTERN_OPTIONS = [
  { value: "grid", label: "Grid" },
  { value: "corridor", label: "Corridor" },
] as const;

function createEmptyCustomCameraForm(): CustomCameraFormState {
  return {
    brand: "",
    model: "",
    sensorWidth_mm: "",
    sensorHeight_mm: "",
    imageWidth_px: "",
    imageHeight_px: "",
    focalLength_mm: "",
    minTriggerInterval_s: "",
    defaultOrientation: "landscape",
    fixedOrientation: false,
  };
}

function matchesQuery(camera: CatalogCamera, query: string): boolean {
  if (query.trim().length === 0) {
    return true;
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  return [camera.brand, camera.model, camera.canonicalName]
    .join("\n")
    .toLocaleLowerCase()
    .includes(normalizedQuery);
}

function groupByBrand(cameras: CatalogCamera[]): Array<{ brand: string; cameras: CatalogCamera[] }> {
  const groups = new Map<string, CatalogCamera[]>();

  for (const camera of cameras) {
    const brandGroup = groups.get(camera.brand) ?? [];
    brandGroup.push(camera);
    groups.set(camera.brand, brandGroup);
  }

  return Array.from(groups.entries()).map(([brand, groupedCameras]) => ({
    brand,
    cameras: groupedCameras,
  }));
}

function formatEstimatedCount(count: number | null): string {
  if (count === null) {
    return "Estimate unavailable";
  }

  return `${count.toLocaleString()} items`;
}

function CameraOption({
  camera,
  selected,
  onSelect,
}: {
  camera: CatalogCamera;
  selected: boolean;
  onSelect: (camera: CatalogCamera) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(camera)}
      className={cn(
        "flex w-full items-start justify-between rounded-md border px-3 py-2 text-left transition-colors",
        selected
          ? "border-accent bg-accent/10 text-text-primary"
          : "border-border bg-bg-primary text-text-secondary hover:text-text-primary",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{camera.canonicalName}</span>
        <span className="block text-[11px] text-text-muted">
          {camera.imageWidth_px}×{camera.imageHeight_px} · {camera.focalLength_mm} mm
        </span>
      </span>
      <span className="rounded-full border border-border/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
        {camera.fixedOrientation
          ? camera.landscape
            ? "Fixed landscape"
            : "Fixed portrait"
          : camera.landscape
            ? "Landscape"
            : "Portrait"}
      </span>
    </button>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
      <ChevronDown className="h-3 w-3" />
      <span>{title}</span>
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-primary px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums text-text-primary">{value}</div>
      {hint ? <div className="mt-1 text-[10px] text-text-muted">{hint}</div> : null}
    </div>
  );
}

export function SurveyPlannerPanel({ planner }: SurveyPlannerPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [customCameraForm, setCustomCameraForm] = useState<CustomCameraFormState>(() => createEmptyCustomCameraForm());
  const isCorridorPattern = planner.patternType === "corridor";
  const generateLabel = isCorridorPattern ? "Generate corridor" : "Generate survey";

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        planner.exitSurveyMode();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [planner]);

  useEffect(() => {
    const handleCompleteCorridor = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !planner.isDrawing || planner.patternType !== "corridor" || planner.drawingVertices.length < 2) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return;
      }

      event.preventDefault();
      planner.completeLine();
    };

    document.addEventListener("keydown", handleCompleteCorridor);
    return () => document.removeEventListener("keydown", handleCompleteCorridor);
  }, [planner]);

  useEffect(() => {
    if (!planner.showCustomCameraForm) {
      setCustomCameraForm(createEmptyCustomCameraForm());
    }
  }, [planner.showCustomCameraForm]);

  const allMatchingCameras = useMemo(
    () => searchCameras(searchQuery),
    [searchQuery],
  );

  const matchingNames = useMemo(
    () => new Set(allMatchingCameras.map((camera) => camera.canonicalName)),
    [allMatchingCameras],
  );

  const recentCameras = useMemo(
    () => getRecentCameras().filter((camera) => matchingNames.has(camera.canonicalName)),
    [matchingNames],
  );

  const recentNames = useMemo(
    () => new Set(recentCameras.map((camera) => camera.canonicalName)),
    [recentCameras],
  );

  const customCameras = useMemo(
    () => getCustomCameras().filter((camera) => matchesQuery(camera, searchQuery) && !recentNames.has(camera.canonicalName)),
    [recentNames, searchQuery],
  );

  const hiddenCustomNames = useMemo(
    () => new Set(customCameras.map((camera) => camera.canonicalName)),
    [customCameras],
  );

  const groupedBuiltinCameras = useMemo(() => {
    const builtinCameras = getBuiltinCameras().filter(
      (camera) => matchingNames.has(camera.canonicalName) && !recentNames.has(camera.canonicalName) && !hiddenCustomNames.has(camera.canonicalName),
    );

    return groupByBrand(builtinCameras);
  }, [hiddenCustomNames, matchingNames, recentNames]);

  const activeRegion = planner.activeRegion;
  const selectedCameraName = planner.selectedCamera?.canonicalName ?? null;

  const handleSaveCustomCamera = () => {
    const brand = customCameraForm.brand.trim();
    const model = customCameraForm.model.trim();
    if (!brand || !model) {
      return;
    }

    planner.saveCustomCamera({
      canonicalName: `${brand} ${model}`,
      brand,
      model,
      sensorWidth_mm: Number(customCameraForm.sensorWidth_mm),
      sensorHeight_mm: Number(customCameraForm.sensorHeight_mm),
      imageWidth_px: Number(customCameraForm.imageWidth_px),
      imageHeight_px: Number(customCameraForm.imageHeight_px),
      focalLength_mm: Number(customCameraForm.focalLength_mm),
      minTriggerInterval_s: customCameraForm.minTriggerInterval_s.trim()
        ? Number(customCameraForm.minTriggerInterval_s)
        : undefined,
      landscape: customCameraForm.defaultOrientation === "landscape",
      fixedOrientation: customCameraForm.fixedOrientation,
    });
  };

  return (
    <div
      data-survey-planner-panel
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-bg-secondary"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-accent" />
          <div>
            <div className="text-sm font-semibold text-text-primary">Survey Planner</div>
            <div className="text-[11px] text-text-muted">
              Draw an area or path, choose a camera, and preview the generated flight.
            </div>
          </div>
        </div>
        {planner.allRegions.length > 1 ? (
          <select
            aria-label="Active survey region"
            value={planner.activeRegionId ?? ""}
            onChange={(event) => planner.selectRegion(event.target.value)}
            className="ml-auto rounded-md border border-border bg-bg-input px-2 py-1 text-xs text-text-primary"
          >
            {planner.allRegions.map((region, index) => (
              <option key={region.id} value={region.id}>
                Region {index + 1}
              </option>
            ))}
          </select>
        ) : null}
        <Button variant="ghost" size="icon" onClick={planner.exitSurveyMode} aria-label="Close survey planner">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <section className="space-y-3 rounded-lg border border-border bg-bg-primary p-3">
            <SectionTitle title="Pattern" />
            <div className="inline-flex rounded-lg border border-border bg-bg-tertiary/40 p-1" role="group" aria-label="Pattern type">
              {PATTERN_OPTIONS.map((option) => {
                const selected = planner.patternType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => planner.setPatternType(option.value)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      selected
                        ? "bg-accent text-white shadow-sm"
                        : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <SectionTitle title="Camera" />
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <input
                aria-label="Search cameras"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by brand, model, or name"
                className="w-full rounded-md border border-border bg-bg-input py-2 pl-9 pr-3 text-sm text-text-primary"
              />
            </label>

            {planner.selectedCamera ? (
              <div className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-text-primary">
                <div className="font-medium">Selected camera</div>
                <div className="mt-1 text-text-secondary">{planner.selectedCamera.canonicalName}</div>
              </div>
            ) : null}

            <div className="space-y-3 rounded-lg border border-border bg-bg-tertiary/30 p-3">
              {recentCameras.length > 0 ? (
                <div className="space-y-2">
                  <SectionTitle title="Recent" />
                  <div className="space-y-1.5">
                    {recentCameras.map((camera) => (
                      <CameraOption
                        key={`recent-${camera.canonicalName}`}
                        camera={camera}
                        selected={selectedCameraName === camera.canonicalName}
                        onSelect={planner.setCamera}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {customCameras.length > 0 ? (
                <div className="space-y-2">
                  <SectionTitle title="Custom profiles" />
                  <div className="space-y-1.5">
                    {customCameras.map((camera) => (
                      <CameraOption
                        key={`custom-${camera.canonicalName}`}
                        camera={camera}
                        selected={selectedCameraName === camera.canonicalName}
                        onSelect={planner.setCamera}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <SectionTitle title="Catalog" />
                {groupedBuiltinCameras.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-text-muted">
                    No cameras match this search.
                  </div>
                ) : (
                  groupedBuiltinCameras.map((group) => (
                    <div key={group.brand} className="space-y-1.5">
                      <div className="text-[11px] font-medium text-text-muted">{group.brand}</div>
                      <div className="space-y-1.5">
                        {group.cameras.map((camera) => (
                          <CameraOption
                            key={camera.canonicalName}
                            camera={camera}
                            selected={selectedCameraName === camera.canonicalName}
                            onSelect={planner.setCamera}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <Button variant="secondary" size="sm" onClick={planner.openCustomCameraForm}>
                <Plus className="h-3.5 w-3.5" /> Add Custom Camera...
              </Button>
            </div>
          </section>

          {planner.showCustomCameraForm ? (
            <section className="space-y-3 rounded-lg border border-border bg-bg-primary p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-text-primary">Custom camera profile</div>
                  <div className="text-[11px] text-text-muted">Saved locally for this device.</div>
                </div>
                <Button variant="ghost" size="icon" onClick={planner.closeCustomCameraForm} aria-label="Cancel custom camera">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <label className="space-y-1 text-xs text-text-secondary">
                  <span>Brand</span>
                  <input
                    aria-label="Custom camera brand"
                    value={customCameraForm.brand}
                    onChange={(event) => setCustomCameraForm((current) => ({ ...current, brand: event.target.value }))}
                    className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <label className="space-y-1 text-xs text-text-secondary">
                  <span>Model</span>
                  <input
                    aria-label="Custom camera model"
                    value={customCameraForm.model}
                    onChange={(event) => setCustomCameraForm((current) => ({ ...current, model: event.target.value }))}
                    className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <label className="space-y-1 text-xs text-text-secondary">
                  <span>Sensor width (mm)</span>
                  <input
                    aria-label="Sensor width"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={customCameraForm.sensorWidth_mm}
                    onChange={(event) => setCustomCameraForm((current) => ({ ...current, sensorWidth_mm: event.target.value }))}
                    className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <label className="space-y-1 text-xs text-text-secondary">
                  <span>Sensor height (mm)</span>
                  <input
                    aria-label="Sensor height"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={customCameraForm.sensorHeight_mm}
                    onChange={(event) => setCustomCameraForm((current) => ({ ...current, sensorHeight_mm: event.target.value }))}
                    className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <label className="space-y-1 text-xs text-text-secondary">
                  <span>Image width (px)</span>
                  <input
                    aria-label="Image width"
                    type="number"
                    min="1"
                    step="1"
                    value={customCameraForm.imageWidth_px}
                    onChange={(event) => setCustomCameraForm((current) => ({ ...current, imageWidth_px: event.target.value }))}
                    className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <label className="space-y-1 text-xs text-text-secondary">
                  <span>Image height (px)</span>
                  <input
                    aria-label="Image height"
                    type="number"
                    min="1"
                    step="1"
                    value={customCameraForm.imageHeight_px}
                    onChange={(event) => setCustomCameraForm((current) => ({ ...current, imageHeight_px: event.target.value }))}
                    className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <label className="space-y-1 text-xs text-text-secondary">
                  <span>Focal length (mm)</span>
                  <input
                    aria-label="Focal length"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={customCameraForm.focalLength_mm}
                    onChange={(event) => setCustomCameraForm((current) => ({ ...current, focalLength_mm: event.target.value }))}
                    className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <label className="space-y-1 text-xs text-text-secondary">
                  <span>Min trigger interval (s)</span>
                  <input
                    aria-label="Min trigger interval"
                    type="number"
                    min="0"
                    step="0.1"
                    value={customCameraForm.minTriggerInterval_s}
                    onChange={(event) => setCustomCameraForm((current) => ({ ...current, minTriggerInterval_s: event.target.value }))}
                    className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
                <label className="space-y-1 text-xs text-text-secondary">
                  <span>Default orientation</span>
                  <select
                    aria-label="Default orientation"
                    value={customCameraForm.defaultOrientation}
                    onChange={(event) => setCustomCameraForm((current) => ({
                      ...current,
                      defaultOrientation: event.target.value as CustomCameraFormState["defaultOrientation"],
                    }))}
                    className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                  >
                    <option value="landscape">Landscape</option>
                    <option value="portrait">Portrait</option>
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={customCameraForm.fixedOrientation}
                  onChange={(event) => setCustomCameraForm((current) => ({ ...current, fixedOrientation: event.target.checked }))}
                />
                Fixed orientation
              </label>

              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={planner.closeCustomCameraForm}>Cancel</Button>
                <Button size="sm" onClick={handleSaveCustomCamera}>Save profile</Button>
              </div>
            </section>
          ) : null}

          <section className="space-y-3 rounded-lg border border-border bg-bg-primary p-3">
            <SectionTitle title="Survey parameters" />
            <div className="grid gap-2 md:grid-cols-2">
              <label className="space-y-1 text-xs text-text-secondary">
                <span>Front overlap (%)</span>
                <input
                  aria-label="Front overlap"
                  type="number"
                  min="0"
                  max="99"
                  step="1"
                  value={planner.params.frontOverlap_pct}
                  onChange={(event) => planner.setParam("frontOverlap_pct", Number(event.target.value))}
                  className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                />
              </label>
              <label className="space-y-1 text-xs text-text-secondary">
                <span>Side overlap (%)</span>
                <input
                  aria-label="Side overlap"
                  type="number"
                  min="0"
                  max="99"
                  step="1"
                  value={planner.params.sideOverlap_pct}
                  onChange={(event) => planner.setParam("sideOverlap_pct", Number(event.target.value))}
                  className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                />
              </label>
              <label className="space-y-1 text-xs text-text-secondary">
                <span>Altitude (m)</span>
                <input
                  aria-label="Altitude"
                  type="number"
                  min="1"
                  step="1"
                  value={planner.params.altitude_m}
                  onChange={(event) => planner.setParam("altitude_m", Number(event.target.value))}
                  className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                />
              </label>
              {!isCorridorPattern ? (
                <label className="space-y-1 text-xs text-text-secondary">
                  <span>Track angle (°)</span>
                  <input
                    aria-label="Track angle"
                    type="number"
                    step="1"
                    value={planner.params.trackAngle_deg}
                    onChange={(event) => planner.setParam("trackAngle_deg", Number(event.target.value))}
                    className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>
              ) : null}
              {isCorridorPattern ? (
                <>
                  <label className="space-y-1 text-xs text-text-secondary">
                    <span>Left width (m)</span>
                    <input
                      aria-label="Left width"
                      type="number"
                      min="1"
                      step="1"
                      value={planner.params.leftWidth_m}
                      onChange={(event) => planner.setParam("leftWidth_m", Number(event.target.value))}
                      className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-text-secondary">
                    <span>Right width (m)</span>
                    <input
                      aria-label="Right width"
                      type="number"
                      min="1"
                      step="1"
                      value={planner.params.rightWidth_m}
                      onChange={(event) => planner.setParam("rightWidth_m", Number(event.target.value))}
                      className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                    />
                  </label>
                </>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="text-xs text-text-secondary">Orientation</div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={planner.params.orientation === "landscape" ? "default" : "secondary"}
                  disabled={planner.selectedCamera?.fixedOrientation && planner.params.orientation !== "landscape"}
                  onClick={() => planner.setParam("orientation", "landscape")}
                >
                  Landscape
                </Button>
                <Button
                  size="sm"
                  variant={planner.params.orientation === "portrait" ? "default" : "secondary"}
                  disabled={planner.selectedCamera?.fixedOrientation && planner.params.orientation !== "portrait"}
                  onClick={() => planner.setParam("orientation", "portrait")}
                >
                  Portrait
                </Button>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-border bg-bg-primary p-3">
            <SectionTitle title="Capture & routing" />
            {!isCorridorPattern ? (
              <div className="space-y-2 rounded-md border border-border bg-bg-secondary/70 p-3">
                <label className="flex items-start gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={planner.params.crosshatch}
                    onChange={(event) => planner.setParam("crosshatch", event.target.checked)}
                  />
                  <span>
                    <span className="font-medium text-text-primary">Crosshatch</span>
                    <span className="mt-1 block text-xs text-text-muted">Adds an orthogonal pass and roughly doubles flight time.</span>
                  </span>
                </label>
              </div>
            ) : null}

            <div className="grid gap-2 md:grid-cols-2">
              <label className="space-y-1 text-xs text-text-secondary">
                <span>Turnaround distance (m)</span>
                <input
                  aria-label="Turnaround distance"
                  type="number"
                  min="0"
                  step="1"
                  value={planner.params.turnaroundDistance_m}
                  onChange={(event) => planner.setParam("turnaroundDistance_m", Number(event.target.value))}
                  className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                />
              </label>
              <label className="space-y-1 text-xs text-text-secondary">
                <span>Capture mode</span>
                <select
                  aria-label="Capture mode"
                  value={planner.params.captureMode}
                  onChange={(event) => planner.setParam("captureMode", event.target.value as typeof planner.params.captureMode)}
                  className="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary"
                >
                  <option value="distance">{CAPTURE_MODE_LABELS.distance}</option>
                  <option value="hover">{CAPTURE_MODE_LABELS.hover}</option>
                </select>
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={planner.params.terrainFollow}
                onChange={(event) => planner.setParam("terrainFollow", event.target.checked)}
              />
              <span>Terrain follow</span>
            </label>
          </section>

          {isCorridorPattern ? (
            <section className="space-y-3 rounded-lg border border-border bg-bg-primary p-3">
              <SectionTitle title="Corridor path" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={planner.isDrawing ? "destructive" : "secondary"} onClick={planner.isDrawing ? planner.stopDraw : planner.startDraw}>
                  <Crosshair className="h-3.5 w-3.5" />
                  {planner.isDrawing ? "Stop drawing" : "Draw line"}
                </Button>
                <Button size="sm" onClick={planner.completeLine} disabled={!planner.isDrawing || planner.drawingVertices.length < 2}>
                  Done
                </Button>
                <Button size="sm" variant="ghost" onClick={() => planner.activeRegionId ? planner.deleteRegion(planner.activeRegionId) : planner.stopDraw()} disabled={!planner.activeRegionId && planner.drawingVertices.length === 0}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
              <div className="text-xs text-text-muted">
                {planner.isDrawing
                  ? `${planner.drawingVertices.length} ${planner.drawingVertices.length === 1 ? "vertex" : "vertices"} — click the map to add more points, then press Done or Enter.`
                  : activeRegion
                    ? `${activeRegion.polyline.length} ${activeRegion.polyline.length === 1 ? "vertex" : "vertices"} on the corridor path.`
                    : "No corridor path yet — start drawing on the map."}
              </div>
            </section>
          ) : (
            <section className="space-y-3 rounded-lg border border-border bg-bg-primary p-3">
              <SectionTitle title="Polygon" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={planner.isDrawing ? "destructive" : "secondary"} onClick={planner.isDrawing ? planner.stopDraw : planner.startDraw}>
                  <Crosshair className="h-3.5 w-3.5" />
                  {planner.isDrawing ? "Stop drawing" : "Draw area"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => planner.activeRegionId ? planner.deleteRegion(planner.activeRegionId) : planner.stopDraw()} disabled={!planner.activeRegionId && planner.drawingVertices.length === 0}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
              <div className="text-xs text-text-muted">
                {planner.isDrawing
                  ? `${planner.drawingVertices.length} ${planner.drawingVertices.length === 1 ? "vertex" : "vertices"} — click the map to add more points.`
                  : activeRegion
                    ? `${activeRegion.polygon.length} ${activeRegion.polygon.length === 1 ? "vertex" : "vertices"} in the active region.`
                    : "No polygon yet — start drawing on the map."}
              </div>
            </section>
          )}

          {activeRegion?.errors.length ? (
            <section className="space-y-2 rounded-lg border border-danger/30 bg-danger/10 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-danger">
                <AlertTriangle className="h-4 w-4" /> Validation errors
              </div>
              <ul className="list-inside list-disc space-y-1 text-xs text-danger/90">
                {activeRegion.errors.map((error, index) => (
                  <li key={`${error.code}-${index}`}>{error.message}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {planner.formattedStats ? (
            <section className="space-y-3 rounded-lg border border-border bg-bg-primary p-3">
              <SectionTitle title="Survey stats" />
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                <StatTile label="Photos" value={planner.formattedStats.photoCount} />
                <StatTile label="GSD" value={planner.formattedStats.gsd} />
                <StatTile label="Area" value={planner.formattedStats.area} />
                <StatTile label="Flight time" value={planner.formattedStats.flightTime} />
                <StatTile label="Lanes" value={planner.formattedStats.laneCount} hint={`Crosshatch ${planner.formattedStats.crosshatchLaneCount}`} />
              </div>
            </section>
          ) : null}

          <section className="space-y-3 rounded-lg border border-border bg-bg-primary p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-text-primary">{generateLabel}</div>
                <div className="text-xs text-text-muted">{formatEstimatedCount(planner.estimatedWaypointCount)}</div>
              </div>
              {planner.activeRegionHasManualEdits ? (
                <div className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  Manual edits will be replaced on regeneration.
                </div>
              ) : null}
            </div>
            <Button
              data-survey-generate
              className="w-full"
              onClick={() => {
                void planner.generate();
              }}
              disabled={!planner.canGenerate}
            >
              {planner.activeRegionHasManualEdits ? <AlertTriangle className="h-4 w-4" /> : null}
              {generateLabel} ({planner.estimatedWaypointCount?.toLocaleString() ?? "—"})
            </Button>
          </section>

          <section className="space-y-3 rounded-lg border border-border bg-bg-primary p-3">
            <SectionTitle title="Regions" />
            {planner.allRegions.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-text-muted">
                Survey regions will appear here after you close a polygon or finish a corridor path.
              </div>
            ) : (
              <div className="space-y-2">
                {planner.allRegions.map((region, index) => (
                  <SurveyRegionCard
                    key={region.id}
                    region={region}
                    label={`Region ${index + 1}`}
                    selected={planner.activeRegionId === region.id}
                    onSelect={() => planner.selectRegion(region.id)}
                    onDissolve={() => {
                      planner.dissolveRegion(region.id);
                    }}
                    onDelete={() => {
                      planner.deleteRegion(region.id);
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
