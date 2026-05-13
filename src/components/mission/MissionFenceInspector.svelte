<script lang="ts">
import { parseLatitude, parseLongitude } from "../../lib/mission-coordinates";
import type { TypedDraftItem, FenceRegionType } from "../../lib/mission-draft-typed";
import type { FenceRegion, GeoPoint2d } from "../../lib/mavkit-types";
import type { MissionPlannerFenceSelection } from "../../lib/stores/mission-planner";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  selection: MissionPlannerFenceSelection;
  item: TypedDraftItem | null;
  returnPoint: GeoPoint2d | null;
  readOnly: boolean;
  onUpdateRegion: (uiId: number, region: FenceRegion) => void;
  onSetReturnPoint: (point: GeoPoint2d | null) => void;
};

let {
  selection,
  item,
  returnPoint,
  readOnly,
  onUpdateRegion,
  onSetReturnPoint,
}: Props = $props();

let validationMessage = $state<string | null>(null);
let returnDraftKey = $state<string | null>(null);
let returnLatitudeDraft = $state<string | null>(null);
let returnLongitudeDraft = $state<string | null>(null);

let region = $derived(item ? item.document as FenceRegion : null);
let selectionLabel = $derived(selection.kind === "region" ? "fence-region" : selection.kind === "return-point" ? "return-point" : "none");
let returnSyncKey = $derived(returnPoint ? `${returnPoint.latitude_deg}:${returnPoint.longitude_deg}` : "no-return-point");
let returnLatitude = $derived(returnDraftKey === returnSyncKey && returnLatitudeDraft !== null ? returnLatitudeDraft : returnPoint ? String(returnPoint.latitude_deg) : "");
let returnLongitude = $derived(returnDraftKey === returnSyncKey && returnLongitudeDraft !== null ? returnLongitudeDraft : returnPoint ? String(returnPoint.longitude_deg) : "");
let visibleValidationMessage = $derived(validationMessage);

function regionKind(current: FenceRegion): FenceRegionType {
  if ("inclusion_polygon" in current) {
    return "inclusion_polygon";
  }

  if ("exclusion_polygon" in current) {
    return "exclusion_polygon";
  }

  if ("inclusion_circle" in current) {
    return "inclusion_circle";
  }

  return "exclusion_circle";
}

function isInclusion(kind: FenceRegionType): boolean {
  return kind === "inclusion_polygon" || kind === "inclusion_circle";
}

function isPolygon(kind: FenceRegionType): boolean {
  return kind === "inclusion_polygon" || kind === "exclusion_polygon";
}

function regionLabel(kind: FenceRegionType): string {
  switch (kind) {
    case "inclusion_polygon":
      return "Inclusion polygon";
    case "exclusion_polygon":
      return "Exclusion polygon";
    case "inclusion_circle":
      return "Inclusion circle";
    case "exclusion_circle":
    default:
      return "Exclusion circle";
  }
}

function polygonVertices(current: FenceRegion): GeoPoint2d[] {
  if ("inclusion_polygon" in current) {
    return current.inclusion_polygon.vertices;
  }

  if ("exclusion_polygon" in current) {
    return current.exclusion_polygon.vertices;
  }

  return [];
}

function circleCenter(current: FenceRegion): GeoPoint2d | null {
  if ("inclusion_circle" in current) {
    return current.inclusion_circle.center;
  }

  if ("exclusion_circle" in current) {
    return current.exclusion_circle.center;
  }

  return null;
}

function circleRadius(current: FenceRegion): number | null {
  if ("inclusion_circle" in current) {
    return current.inclusion_circle.radius_m;
  }

  if ("exclusion_circle" in current) {
    return current.exclusion_circle.radius_m;
  }

  return null;
}

function inclusionGroup(current: FenceRegion): number | null {
  if ("inclusion_polygon" in current) {
    return current.inclusion_polygon.inclusion_group;
  }

  if ("inclusion_circle" in current) {
    return current.inclusion_circle.inclusion_group;
  }

  return null;
}

function anchorForRegion(current: FenceRegion): GeoPoint2d {
  const center = circleCenter(current);
  if (center) {
    return center;
  }

  const vertices = polygonVertices(current);
  if (vertices.length === 0) {
    return { latitude_deg: 47.397742, longitude_deg: 8.545594 };
  }

  const totals = vertices.reduce(
    (sum, point) => ({
      latitude_deg: sum.latitude_deg + point.latitude_deg,
      longitude_deg: sum.longitude_deg + point.longitude_deg,
    }),
    { latitude_deg: 0, longitude_deg: 0 },
  );

  return {
    latitude_deg: totals.latitude_deg / vertices.length,
    longitude_deg: totals.longitude_deg / vertices.length,
  };
}

function defaultPolygonVertices(anchor: GeoPoint2d): GeoPoint2d[] {
  return [
    { latitude_deg: anchor.latitude_deg + 0.0005, longitude_deg: anchor.longitude_deg - 0.0005 },
    { latitude_deg: anchor.latitude_deg + 0.0005, longitude_deg: anchor.longitude_deg + 0.0005 },
    { latitude_deg: anchor.latitude_deg - 0.0005, longitude_deg: anchor.longitude_deg + 0.0005 },
    { latitude_deg: anchor.latitude_deg - 0.0005, longitude_deg: anchor.longitude_deg - 0.0005 },
  ];
}

function recastRegionType(current: FenceRegion, nextType: FenceRegionType): FenceRegion {
  const anchor = anchorForRegion(current);
  const currentKind = regionKind(current);
  const currentVertices = polygonVertices(current);
  const currentRadius = circleRadius(current) ?? 50;
  const currentGroup = inclusionGroup(current) ?? 0;

  if (nextType === currentKind) {
    return current;
  }

  if (nextType === "inclusion_polygon") {
    return {
      inclusion_polygon: {
        vertices: isPolygon(currentKind) && currentVertices.length >= 3 ? currentVertices.map((point) => ({ ...point })) : defaultPolygonVertices(anchor),
        inclusion_group: currentGroup,
      },
    };
  }

  if (nextType === "exclusion_polygon") {
    return {
      exclusion_polygon: {
        vertices: isPolygon(currentKind) && currentVertices.length >= 3 ? currentVertices.map((point) => ({ ...point })) : defaultPolygonVertices(anchor),
      },
    };
  }

  if (nextType === "inclusion_circle") {
    return {
      inclusion_circle: {
        center: { ...anchor },
        radius_m: currentRadius,
        inclusion_group: currentGroup,
      },
    };
  }

  return {
    exclusion_circle: {
      center: { ...anchor },
      radius_m: currentRadius,
    },
  };
}

function withPolygonVertices(current: FenceRegion, vertices: GeoPoint2d[]): FenceRegion {
  if ("inclusion_polygon" in current) {
    return {
      inclusion_polygon: {
        ...current.inclusion_polygon,
        vertices,
      },
    };
  }

	if ("exclusion_polygon" in current) {
		return {
		exclusion_polygon: {
			...current.exclusion_polygon,
			vertices,
		},
	};
	}

	return current;
}

function withCircleCenter(current: FenceRegion, center: GeoPoint2d): FenceRegion {
  if ("inclusion_circle" in current) {
    return {
      inclusion_circle: {
        ...current.inclusion_circle,
        center,
      },
    };
  }

	if ("exclusion_circle" in current) {
		return {
		exclusion_circle: {
			...current.exclusion_circle,
			center,
		},
	};
	}

	return current;
}

function withCircleRadius(current: FenceRegion, radius_m: number): FenceRegion {
  if ("inclusion_circle" in current) {
    return {
      inclusion_circle: {
        ...current.inclusion_circle,
        radius_m,
      },
    };
  }

	if ("exclusion_circle" in current) {
		return {
		exclusion_circle: {
			...current.exclusion_circle,
			radius_m,
		},
	};
	}

	return current;
}

function withInclusionGroup(current: FenceRegion, group: number): FenceRegion {
  if ("inclusion_polygon" in current) {
    return {
      inclusion_polygon: {
        ...current.inclusion_polygon,
        inclusion_group: group,
      },
    };
  }

	if ("inclusion_circle" in current) {
		return {
		inclusion_circle: {
			...current.inclusion_circle,
			inclusion_group: group,
		},
	};
	}

	return current;
}

function commitRegion(next: FenceRegion) {
  if (!item || readOnly) {
    validationMessage = readOnly ? "Fence editing is read-only in the current planner attachment state." : null;
    return;
  }

  validationMessage = null;
  onUpdateRegion(item.uiId, next);
}

function commitCoordinate(
  rawValue: string,
  label: "latitude" | "longitude",
  onCommit: (value: number) => void,
) {
  const parsed = label === "latitude" ? parseLatitude(rawValue) : parseLongitude(rawValue);
  if (!parsed.ok) {
    validationMessage = `Enter a valid ${label} before committing this fence edit.`;
    return;
  }

  validationMessage = null;
  onCommit(parsed.value);
}

function beginReturnDraft() {
  if (returnDraftKey === returnSyncKey) {
    return;
  }

  returnDraftKey = returnSyncKey;
  returnLatitudeDraft = returnPoint ? String(returnPoint.latitude_deg) : "";
  returnLongitudeDraft = returnPoint ? String(returnPoint.longitude_deg) : "";
  validationMessage = null;
}

function resetReturnDraft() {
  returnDraftKey = null;
  returnLatitudeDraft = null;
  returnLongitudeDraft = null;
  validationMessage = null;
}

function commitReturnPoint() {
  if (readOnly) {
    validationMessage = "Fence editing is read-only in the current planner attachment state.";
    return;
  }

  const nextLatitude = returnLatitude.trim();
  const nextLongitude = returnLongitude.trim();

  if (!nextLatitude && !nextLongitude) {
    resetReturnDraft();
    onSetReturnPoint(null);
    return;
  }

  if (!nextLatitude || !nextLongitude) {
    validationMessage = "Enter latitude and longitude before committing the fence return point.";
    return;
  }

  const parsedLatitude = parseLatitude(nextLatitude);
  const parsedLongitude = parseLongitude(nextLongitude);
  if (!parsedLatitude.ok || !parsedLongitude.ok) {
    validationMessage = "Enter a valid latitude and longitude before committing the fence return point.";
    return;
  }

  resetReturnDraft();
  onSetReturnPoint({
    latitude_deg: parsedLatitude.value,
    longitude_deg: parsedLongitude.value,
  });
}

function handleEnter(event: KeyboardEvent) {
  if (event.key === "Enter") {
    (event.currentTarget as HTMLInputElement).blur();
  }
}
</script>

<section class="rounded-lg border border-border bg-bg-primary p-3" data-testid={missionWorkspaceTestIds.fenceInspector}>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Fence inspector</p>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">Selected fence detail</h3>
    </div>

    <span
      class="rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-secondary"
      data-testid={missionWorkspaceTestIds.fenceInspectorSelectionKind}
    >
      {selectionLabel}
    </span>
  </div>

  {#if selection.kind === "none"}
    <div class="mt-4 rounded-lg border border-dashed border-border bg-bg-secondary/60 px-4 py-5 text-sm text-text-secondary" data-testid={missionWorkspaceTestIds.fenceInspectorEmpty}>
      Select a fence region or the return point from the list or the map to edit it here with precise coordinates, radius, and inclusion-group controls.
    </div>
  {:else if selection.kind === "return-point"}
    <div class="mt-4 space-y-4" data-testid={missionWorkspaceTestIds.fenceInspectorReturnPoint}>
      <div class="rounded-lg border border-border bg-bg-secondary/60 p-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Fence return point</p>
        <p class="mt-1 text-sm text-text-secondary">This point stays separate from Home so fence recovery can target a dedicated location without implying Home sync or mission upload parity.</p>
      </div>

      <div class="grid gap-3 md:grid-cols-2">
        <label class="space-y-1 rounded-lg border border-border bg-bg-secondary/60 p-3">
          <span class="text-xs font-medium text-text-muted">Latitude</span>
          <input
            class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
            data-testid={missionWorkspaceTestIds.fenceReturnLatitude}
            disabled={readOnly}
            inputmode="decimal"
            onblur={commitReturnPoint}
            onfocus={beginReturnDraft}
            oninput={(event) => {
              beginReturnDraft();
              returnLatitudeDraft = (event.currentTarget as HTMLInputElement).value;
            }}
            onkeydown={handleEnter}
            type="text"
            value={returnLatitude}
          />
        </label>

        <label class="space-y-1 rounded-lg border border-border bg-bg-secondary/60 p-3">
          <span class="text-xs font-medium text-text-muted">Longitude</span>
          <input
            class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
            data-testid={missionWorkspaceTestIds.fenceReturnLongitude}
            disabled={readOnly}
            inputmode="decimal"
            onblur={commitReturnPoint}
            onfocus={beginReturnDraft}
            oninput={(event) => {
              beginReturnDraft();
              returnLongitudeDraft = (event.currentTarget as HTMLInputElement).value;
            }}
            onkeydown={handleEnter}
            type="text"
            value={returnLongitude}
          />
        </label>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          class="rounded-md border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-semibold text-danger transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={readOnly || returnPoint === null}
          onclick={() => {
            resetReturnDraft();
            onSetReturnPoint(null);
          }}
          type="button"
        >
          Clear return point
        </button>
      </div>
    </div>
  {:else if !item || !region}
    <div class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-5 text-sm text-warning">
      <p class="font-semibold">Fence selection unavailable</p>
      <p class="mt-2 text-xs text-warning/90">The selected fence region could not be resolved from the active planner state, so the inspector stayed fail-closed instead of rendering broken controls.</p>
    </div>
  {:else}
    <div class="mt-4 space-y-4">
      <div class="rounded-lg border border-border bg-bg-secondary/60 p-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Fence region {item.index + 1}</p>
        <h4 class="mt-1 text-base font-semibold text-text-primary">{regionLabel(regionKind(region))}</h4>
        <p class="mt-1 text-xs text-text-secondary">Switch between inclusion / exclusion and polygon / circle without leaving the active fence selection.</p>
      </div>

      <label class="space-y-1">
        <span class="text-xs font-medium text-text-muted">Region type</span>
        <select
          class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
          data-testid={missionWorkspaceTestIds.fenceInspectorType}
          disabled={readOnly}
          onchange={(event) => {
            const nextType = (event.currentTarget as HTMLSelectElement).value as FenceRegionType;
            commitRegion(recastRegionType(region, nextType));
          }}
          value={regionKind(region)}
        >
          <option value="inclusion_polygon">Inclusion polygon</option>
          <option value="exclusion_polygon">Exclusion polygon</option>
          <option value="inclusion_circle">Inclusion circle</option>
          <option value="exclusion_circle">Exclusion circle</option>
        </select>
      </label>

      {#if isPolygon(regionKind(region))}
        <div class="space-y-3 rounded-lg border border-border bg-bg-secondary/60 p-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Vertices</p>
              <p class="mt-1 text-xs text-text-secondary">Edit polygon vertices numerically when map dragging needs tighter control.</p>
            </div>
            <button
              class="rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={missionWorkspaceTestIds.fenceVertexAdd}
              disabled={readOnly}
              onclick={() => {
                const vertices = polygonVertices(region);
                const last = vertices[vertices.length - 1];
                const nextVertex = last
                  ? { latitude_deg: last.latitude_deg + 0.0002, longitude_deg: last.longitude_deg + 0.0002 }
                  : { latitude_deg: 47.397742, longitude_deg: 8.545594 };
                commitRegion(withPolygonVertices(region, [...vertices, nextVertex]));
              }}
              type="button"
            >
              Add vertex
            </button>
          </div>

          <div class="space-y-3">
            {#each polygonVertices(region) as vertex, index (`vertex-${index}`)}
              <div class="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                <span class="text-xs font-semibold uppercase tracking-wide text-text-muted">V{index + 1}</span>
                <label class="space-y-1">
                  <span class="text-xs font-medium text-text-muted">Latitude</span>
                  <input
                    class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
                    data-testid={`${missionWorkspaceTestIds.fenceVertexLatitudePrefix}-${index}`}
                    disabled={readOnly}
                    inputmode="decimal"
                    onchange={(event) => commitCoordinate((event.currentTarget as HTMLInputElement).value, "latitude", (value) => {
                      const nextVertices = [...polygonVertices(region)];
                      nextVertices[index] = { ...vertex, latitude_deg: value };
                      commitRegion(withPolygonVertices(region, nextVertices));
                    })}
                    type="number"
                    value={vertex.latitude_deg}
                  />
                </label>
                <label class="space-y-1">
                  <span class="text-xs font-medium text-text-muted">Longitude</span>
                  <input
                    class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
                    data-testid={`${missionWorkspaceTestIds.fenceVertexLongitudePrefix}-${index}`}
                    disabled={readOnly}
                    inputmode="decimal"
                    onchange={(event) => commitCoordinate((event.currentTarget as HTMLInputElement).value, "longitude", (value) => {
                      const nextVertices = [...polygonVertices(region)];
                      nextVertices[index] = { ...vertex, longitude_deg: value };
                      commitRegion(withPolygonVertices(region, nextVertices));
                    })}
                    type="number"
                    value={vertex.longitude_deg}
                  />
                </label>
                <button
                  class="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid={`${missionWorkspaceTestIds.fenceVertexRemovePrefix}-${index}`}
                  disabled={readOnly || polygonVertices(region).length <= 3}
                  onclick={() => {
                    const nextVertices = polygonVertices(region).filter((_, candidateIndex) => candidateIndex !== index);
                    commitRegion(withPolygonVertices(region, nextVertices));
                  }}
                  type="button"
                >
                  Remove
                </button>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="grid gap-3 md:grid-cols-3">
          {#if circleCenter(region)}
            <label class="space-y-1 rounded-lg border border-border bg-bg-secondary/60 p-3">
              <span class="text-xs font-medium text-text-muted">Center latitude</span>
              <input
                class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
                data-testid={missionWorkspaceTestIds.fenceCircleLatitude}
                disabled={readOnly}
                inputmode="decimal"
                onchange={(event) => commitCoordinate((event.currentTarget as HTMLInputElement).value, "latitude", (value) => {
                  const center = circleCenter(region);
                  if (!center) {
                    return;
                  }
                  commitRegion(withCircleCenter(region, { ...center, latitude_deg: value }));
                })}
                type="number"
                value={circleCenter(region)?.latitude_deg ?? 0}
              />
            </label>

            <label class="space-y-1 rounded-lg border border-border bg-bg-secondary/60 p-3">
              <span class="text-xs font-medium text-text-muted">Center longitude</span>
              <input
                class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
                data-testid={missionWorkspaceTestIds.fenceCircleLongitude}
                disabled={readOnly}
                inputmode="decimal"
                onchange={(event) => commitCoordinate((event.currentTarget as HTMLInputElement).value, "longitude", (value) => {
                  const center = circleCenter(region);
                  if (!center) {
                    return;
                  }
                  commitRegion(withCircleCenter(region, { ...center, longitude_deg: value }));
                })}
                type="number"
                value={circleCenter(region)?.longitude_deg ?? 0}
              />
            </label>
          {/if}

          <label class="space-y-1 rounded-lg border border-border bg-bg-secondary/60 p-3">
            <span class="text-xs font-medium text-text-muted">Radius (m)</span>
            <input
              class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
              data-testid={missionWorkspaceTestIds.fenceCircleRadius}
              disabled={readOnly}
              inputmode="decimal"
              onchange={(event) => {
                const nextValue = Number((event.currentTarget as HTMLInputElement).value);
                if (!Number.isFinite(nextValue)) {
                  validationMessage = "Enter a valid radius before committing this fence edit.";
                  return;
                }
                validationMessage = null;
                commitRegion(withCircleRadius(region, nextValue));
              }}
              type="number"
              value={circleRadius(region) ?? 0}
            />
          </label>
        </div>
      {/if}

      {#if isInclusion(regionKind(region))}
        <label class="space-y-1 rounded-lg border border-border bg-bg-secondary/60 p-3">
          <span class="text-xs font-medium text-text-muted">Inclusion group</span>
          <input
            class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
            data-testid={missionWorkspaceTestIds.fenceInclusionGroup}
            disabled={readOnly}
            inputmode="numeric"
            onchange={(event) => {
              const nextValue = Math.round(Number((event.currentTarget as HTMLInputElement).value));
              if (!Number.isFinite(nextValue) || nextValue < 0) {
                validationMessage = "Enter a non-negative inclusion group before committing this fence edit.";
                return;
              }
              validationMessage = null;
              commitRegion(withInclusionGroup(region, nextValue));
            }}
            type="number"
            value={inclusionGroup(region) ?? 0}
          />
        </label>
      {/if}
    </div>
  {/if}

  {#if visibleValidationMessage}
    <p class="mt-3 text-xs text-warning" data-testid={missionWorkspaceTestIds.fenceInspectorValidation}>{visibleValidationMessage}</p>
  {/if}
</section>
