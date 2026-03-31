import { describe, expect, it } from "vitest";

import type { MissionItem, MissionPlan, FencePlan, RallyPlan, GeoPoint3d, FenceRegion, MissionCommand } from "./mavkit-types";
import { defaultGeoPoint3d, geoPoint3dLatLon, geoPoint3dAltitude, commandPosition } from "./mavkit-types";
import {
    addFenceRegionAt,
    addTypedWaypoint,
    addTypedWaypointAt,
    bulkDelete,
    bulkUpdateAltitude,
    createTypedDraftState,
    deleteTypedAt,
    insertTypedItemsAfter,
    isTypedDraftDirty,
    moveDirtyDraftToRecoverable,
    moveTypedWaypointOnMap,
    recoverTypedDraft,
    replaceAllTypedItems,
    replaceTypedDraftFromDownload,
    selectTypedDraftIndex,
    selectTypedDraftRange,
    toggleTypedDraftSelection,
    typedDraftItems,
    typedDraftPlan,
    typedDraftSelectedIndex,
    typedDraftSelectedIndices,
    typedDraftSelectionCount,
    updateFenceRegion,
    updateRallyAltitudeFrame,
    updateTypedAltitude,
    updateTypedCommand,
    updateTypedLatitude,
    updateTypedLongitude,
    type SessionScope,
} from "./mission-draft-typed";

function scope(sessionId: string, sourceKind: SessionScope["source_kind"], seekEpoch = 0): SessionScope {
    return {
        session_id: sessionId,
        source_kind: sourceKind,
        seek_epoch: seekEpoch,
        reset_revision: seekEpoch,
    };
}

function makeWaypoint(lat: number, lon: number, alt: number): MissionItem {
    return {
        command: {
            Nav: {
                Waypoint: {
                    position: defaultGeoPoint3d(lat, lon, alt),
                    hold_time_s: 0,
                    acceptance_radius_m: 1,
                    pass_radius_m: 0,
                    yaw_deg: 0,
                },
            },
        },
        current: false,
        autocontinue: true,
    };
}

function makeOtherItem(): MissionItem {
    return {
        command: {
            Other: {
                command: 9999,
                frame: { Other: 0 },
                param1: 1,
                param2: 2,
                param3: 3,
                param4: 4,
                x: 100,
                y: 200,
                z: 300,
            },
        },
        current: false,
        autocontinue: false,
    };
}

function makeDelayItem(): MissionItem {
    return {
        command: {
            Nav: {
                Delay: {
                    seconds: 5,
                    hour_utc: 0,
                    min_utc: 0,
                    sec_utc: 0,
                },
            },
        },
        current: false,
        autocontinue: true,
    };
}

function makeFenceRegion(lat: number, lon: number): FenceRegion {
    return {
        inclusion_polygon: {
            vertices: [
                { latitude_deg: lat - 0.001, longitude_deg: lon - 0.001 },
                { latitude_deg: lat + 0.001, longitude_deg: lon - 0.001 },
                { latitude_deg: lat + 0.001, longitude_deg: lon + 0.001 },
                { latitude_deg: lat - 0.001, longitude_deg: lon + 0.001 },
            ],
            inclusion_group: 0,
        },
    };
}

function makeRallyPoint(lat: number, lon: number, alt: number): GeoPoint3d {
    return defaultGeoPoint3d(lat, lon, alt);
}

// ---------------------------------------------------------------------------
// Mission domain
// ---------------------------------------------------------------------------

describe("mission-draft-typed: mission domain", () => {
    it("loads a mission plan and creates draft items with preview", () => {
        const plan: MissionPlan = { items: [makeWaypoint(47.397, 8.545, 25)] };
        const liveScope = scope("live-1", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);

        const items = typedDraftItems(state, "mission");
        expect(items).toHaveLength(1);
        expect(items[0].readOnly).toBe(false);
        expect(items[0].preview.latitude_deg).toBeCloseTo(47.397, 3);
        expect(items[0].preview.longitude_deg).toBeCloseTo(8.545, 3);
        expect(items[0].preview.altitude_m).toBeCloseTo(25, 0);
    });

    it("marks Other commands as read-only", () => {
        const plan: MissionPlan = { items: [makeOtherItem()] };
        const liveScope = scope("live-ro", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);

        const items = typedDraftItems(state, "mission");
        expect(items[0].readOnly).toBe(true);
    });

    it("read-only items ignore altitude updates", () => {
        const plan: MissionPlan = { items: [makeOtherItem()] };
        const liveScope = scope("live-ro-alt", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);
        const updated = updateTypedAltitude(state, "mission", 0, 999);

        // Item should remain unchanged
        const doc = (typedDraftItems(updated, "mission")[0].document as MissionItem).command;
        expect("Other" in doc).toBe(true);
    });

    it("items without position yield null preview lat/lon/alt", () => {
        const plan: MissionPlan = { items: [makeDelayItem()] };
        const liveScope = scope("live-delay", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);

        const items = typedDraftItems(state, "mission");
        expect(items[0].preview.latitude_deg).toBeNull();
        expect(items[0].preview.longitude_deg).toBeNull();
        expect(items[0].preview.altitude_m).toBeNull();
        expect(items[0].readOnly).toBe(false);
    });

    it("updates the command on a mission item", () => {
        const plan: MissionPlan = { items: [makeWaypoint(47.1, 8.1, 25)] };
        const liveScope = scope("live-cmd", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);

        const newCommand: MissionCommand = {
            Nav: {
                Takeoff: {
                    position: defaultGeoPoint3d(47.1, 8.1, 50),
                    pitch_deg: 15,
                },
            },
        };
        const updated = updateTypedCommand(state, "mission", 0, newCommand);
        const doc = typedDraftItems(updated, "mission")[0].document as MissionItem;
        expect("Nav" in doc.command).toBe(true);
        const nav = (doc.command as { Nav: unknown }).Nav;
        expect("Takeoff" in (nav as Record<string, unknown>)).toBe(true);
    });

    it("updates altitude on a mission item via GeoPoint3d", () => {
        const plan: MissionPlan = { items: [makeWaypoint(47.1, 8.1, 25)] };
        const liveScope = scope("live-alt", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);

        const updated = updateTypedAltitude(state, "mission", 0, 120);
        const doc = typedDraftItems(updated, "mission")[0].document as MissionItem;
        const pos = commandPosition(doc.command)!;
        expect(geoPoint3dAltitude(pos).value).toBe(120);
        // lat/lon preserved
        const { latitude_deg, longitude_deg } = geoPoint3dLatLon(pos);
        expect(latitude_deg).toBeCloseTo(47.1, 3);
        expect(longitude_deg).toBeCloseTo(8.1, 3);
    });

    it("updates latitude on a mission item", () => {
        const plan: MissionPlan = { items: [makeWaypoint(47.1, 8.1, 25)] };
        const liveScope = scope("live-lat", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);

        const updated = updateTypedLatitude(state, "mission", 0, 48.0);
        const doc = typedDraftItems(updated, "mission")[0].document as MissionItem;
        const pos = commandPosition(doc.command)!;
        const { latitude_deg, longitude_deg } = geoPoint3dLatLon(pos);
        expect(latitude_deg).toBeCloseTo(48.0, 3);
        expect(longitude_deg).toBeCloseTo(8.1, 3);
    });

    it("updates longitude on a mission item", () => {
        const plan: MissionPlan = { items: [makeWaypoint(47.1, 8.1, 25)] };
        const liveScope = scope("live-lon", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);

        const updated = updateTypedLongitude(state, "mission", 0, 9.0);
        const doc = typedDraftItems(updated, "mission")[0].document as MissionItem;
        const pos = commandPosition(doc.command)!;
        const { latitude_deg, longitude_deg } = geoPoint3dLatLon(pos);
        expect(latitude_deg).toBeCloseTo(47.1, 3);
        expect(longitude_deg).toBeCloseTo(9.0, 3);
    });

    it("moves a waypoint on map", () => {
        const plan: MissionPlan = { items: [makeWaypoint(47.1, 8.1, 25)] };
        const liveScope = scope("live-move", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);

        const updated = moveTypedWaypointOnMap(state, "mission", 0, 48.5, 9.5);
        const doc = typedDraftItems(updated, "mission")[0].document as MissionItem;
        const pos = commandPosition(doc.command)!;
        const { latitude_deg, longitude_deg } = geoPoint3dLatLon(pos);
        expect(latitude_deg).toBeCloseTo(48.5, 3);
        expect(longitude_deg).toBeCloseTo(9.5, 3);
        expect(geoPoint3dAltitude(pos).value).toBe(25);
    });

    it("inserts typed items after a given index", () => {
        const plan: MissionPlan = { items: [makeWaypoint(47.1, 8.1, 25)] };
        const liveScope = scope("live-insert", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);

        const newItems: MissionItem[] = [makeWaypoint(47.2, 8.2, 30), makeWaypoint(47.3, 8.3, 35)];
        const updated = insertTypedItemsAfter(state, "mission", 0, newItems);
        expect(typedDraftItems(updated, "mission")).toHaveLength(3);
        expect(typedDraftItems(updated, "mission")[1].preview.latitude_deg).toBeCloseTo(47.2, 3);
        expect(typedDraftItems(updated, "mission")[2].preview.latitude_deg).toBeCloseTo(47.3, 3);
    });

    it("replaces all typed items", () => {
        const plan: MissionPlan = { items: [makeWaypoint(47.1, 8.1, 25)] };
        const liveScope = scope("live-replace", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);

        const newItems: MissionItem[] = [makeWaypoint(48.0, 9.0, 50)];
        const updated = replaceAllTypedItems(state, "mission", newItems);
        expect(typedDraftItems(updated, "mission")).toHaveLength(1);
        expect(typedDraftItems(updated, "mission")[0].preview.latitude_deg).toBeCloseTo(48.0, 3);
    });
});

// ---------------------------------------------------------------------------
// Fence domain
// ---------------------------------------------------------------------------

describe("mission-draft-typed: fence domain", () => {
    it("loads a fence plan and creates draft items with centroid preview", () => {
        const plan: FencePlan = {
            return_point: null,
            regions: [makeFenceRegion(47.4, 8.54)],
        };
        const liveScope = scope("fence-1", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "fence", plan, liveScope);

        const items = typedDraftItems(state, "fence");
        expect(items).toHaveLength(1);
        expect(items[0].readOnly).toBe(false);
        expect(items[0].preview.latitude_deg).toBeCloseTo(47.4, 2);
        expect(items[0].preview.longitude_deg).toBeCloseTo(8.54, 2);
        expect(items[0].preview.altitude_m).toBeNull();
    });

    it("adds a default fence region at a specified location", () => {
        const plan: FencePlan = { return_point: null, regions: [] };
        const liveScope = scope("fence-add", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "fence", plan, liveScope);

        const updated = addTypedWaypointAt(state, "fence", 47.5, 8.6);
        const items = typedDraftItems(updated, "fence");
        expect(items).toHaveLength(1);
        const region = items[0].document as FenceRegion;
        expect("inclusion_polygon" in region).toBe(true);
    });

    it("deletes a fence region", () => {
        const plan: FencePlan = {
            return_point: null,
            regions: [makeFenceRegion(47.4, 8.54), makeFenceRegion(47.5, 8.55)],
        };
        const liveScope = scope("fence-del", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "fence", plan, liveScope);

        const updated = deleteTypedAt(state, "fence", 0);
        expect(typedDraftItems(updated, "fence")).toHaveLength(1);
    });

    it("updateFenceRegion replaces region and updates preview", () => {
        const plan: FencePlan = {
            return_point: null,
            regions: [makeFenceRegion(47.4, 8.54)],
        };
        const liveScope = scope("fence-update", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "fence", plan, liveScope);

        // Replace inclusion polygon with an exclusion circle
        const circle: FenceRegion = {
            exclusion_circle: {
                center: { latitude_deg: 48.0, longitude_deg: 9.0 },
                radius_m: 500,
            },
        };
        const updated = updateFenceRegion(state, 0, circle);
        const items = typedDraftItems(updated, "fence");
        expect(items).toHaveLength(1);

        const doc = items[0].document as FenceRegion;
        expect("exclusion_circle" in doc).toBe(true);
        expect(items[0].preview.latitude_deg).toBeCloseTo(48.0, 3);
        expect(items[0].preview.longitude_deg).toBeCloseTo(9.0, 3);
        expect(items[0].preview.altitude_m).toBeNull();
    });

    it("preserves return_point when modifying regions", () => {
        const plan: FencePlan = {
            return_point: { latitude_deg: 47.0, longitude_deg: 8.0 },
            regions: [makeFenceRegion(47.4, 8.54)],
        };
        const liveScope = scope("fence-rp", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "fence", plan, liveScope);

        const updated = addTypedWaypointAt(state, "fence", 47.5, 8.6);
        const fencePlan = typedDraftPlan(updated, "fence");
        expect(fencePlan.return_point).toEqual({ latitude_deg: 47.0, longitude_deg: 8.0 });
        expect(fencePlan.regions).toHaveLength(2);
    });

    it("addFenceRegionAt creates inclusion polygon with 4 vertices", () => {
        const plan: FencePlan = { return_point: null, regions: [] };
        const liveScope = scope("fence-add-incl-poly", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "fence", plan, liveScope);

        const updated = addFenceRegionAt(state, 47.5, 8.6, "inclusion_polygon");
        const items = typedDraftItems(updated, "fence");
        expect(items).toHaveLength(1);
        const region = items[0].document as FenceRegion;
        expect(region).toHaveProperty("inclusion_polygon");
        if (!("inclusion_polygon" in region)) throw new Error("expected inclusion_polygon");
        expect(region.inclusion_polygon.vertices).toHaveLength(4);
        expect(region.inclusion_polygon.inclusion_group).toBe(0);
    });

    it("addFenceRegionAt creates exclusion circle with 50m radius", () => {
        const plan: FencePlan = { return_point: null, regions: [] };
        const liveScope = scope("fence-add-excl-circle", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "fence", plan, liveScope);

        const updated = addFenceRegionAt(state, 47.5, 8.6, "exclusion_circle");
        const items = typedDraftItems(updated, "fence");
        expect(items).toHaveLength(1);
        const region = items[0].document as FenceRegion;
        expect(region).toHaveProperty("exclusion_circle");
        if (!("exclusion_circle" in region)) throw new Error("expected exclusion_circle");
        expect(region.exclusion_circle.center.latitude_deg).toBeCloseTo(47.5, 3);
        expect(region.exclusion_circle.center.longitude_deg).toBeCloseTo(8.6, 3);
        expect(region.exclusion_circle.radius_m).toBe(50);
    });
});

// ---------------------------------------------------------------------------
// Rally domain
// ---------------------------------------------------------------------------

describe("mission-draft-typed: rally domain", () => {
    it("loads a rally plan and creates draft items with preview", () => {
        const plan: RallyPlan = {
            points: [makeRallyPoint(47.5, 8.55, 45)],
        };
        const liveScope = scope("rally-1", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "rally", plan, liveScope);

        const items = typedDraftItems(state, "rally");
        expect(items).toHaveLength(1);
        expect(items[0].readOnly).toBe(false);
        expect(items[0].preview.latitude_deg).toBeCloseTo(47.5, 3);
        expect(items[0].preview.longitude_deg).toBeCloseTo(8.55, 3);
        expect(items[0].preview.altitude_m).toBeCloseTo(45, 0);
    });

    it("adds a default rally point at a specified location", () => {
        const plan: RallyPlan = { points: [] };
        const liveScope = scope("rally-add", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "rally", plan, liveScope);

        const updated = addTypedWaypointAt(state, "rally", 47.6, 8.7);
        const items = typedDraftItems(updated, "rally");
        expect(items).toHaveLength(1);
        const pt = items[0].document as GeoPoint3d;
        const { latitude_deg, longitude_deg } = geoPoint3dLatLon(pt);
        expect(latitude_deg).toBeCloseTo(47.6, 3);
        expect(longitude_deg).toBeCloseTo(8.7, 3);
    });

    it("deletes a rally point", () => {
        const plan: RallyPlan = {
            points: [makeRallyPoint(47.5, 8.55, 45), makeRallyPoint(47.6, 8.66, 50)],
        };
        const liveScope = scope("rally-del", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "rally", plan, liveScope);

        const updated = deleteTypedAt(state, "rally", 0);
        expect(typedDraftItems(updated, "rally")).toHaveLength(1);
    });

    it("updates altitude on a rally point", () => {
        const plan: RallyPlan = { points: [makeRallyPoint(47.5, 8.55, 45)] };
        const liveScope = scope("rally-alt", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "rally", plan, liveScope);

        const updated = updateTypedAltitude(state, "rally", 0, 100);
        const pt = typedDraftItems(updated, "rally")[0].document as GeoPoint3d;
        expect(geoPoint3dAltitude(pt).value).toBe(100);
    });

    it("moves a rally point on map", () => {
        const plan: RallyPlan = { points: [makeRallyPoint(47.5, 8.55, 45)] };
        const liveScope = scope("rally-move", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "rally", plan, liveScope);

        const updated = moveTypedWaypointOnMap(state, "rally", 0, 48.0, 9.0);
        const pt = typedDraftItems(updated, "rally")[0].document as GeoPoint3d;
        const { latitude_deg, longitude_deg } = geoPoint3dLatLon(pt);
        expect(latitude_deg).toBeCloseTo(48.0, 3);
        expect(longitude_deg).toBeCloseTo(9.0, 3);
        expect(geoPoint3dAltitude(pt).value).toBe(45);
    });

    it("updateRallyAltitudeFrame changes variant and resets altitude", () => {
        const plan: RallyPlan = { points: [makeRallyPoint(47.5, 8.55, 100)] };
        const liveScope = scope("rally-frame", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "rally", plan, liveScope);

        // Default is RelHome; change to Msl
        const updated = updateRallyAltitudeFrame(state, 0, "msl");
        const pt = typedDraftItems(updated, "rally")[0].document as GeoPoint3d;
        expect(pt).toHaveProperty("Msl");
        const { latitude_deg, longitude_deg } = geoPoint3dLatLon(pt);
        expect(latitude_deg).toBeCloseTo(47.5, 3);
        expect(longitude_deg).toBeCloseTo(8.55, 3);
        expect(geoPoint3dAltitude(pt).value).toBe(0);
        expect(geoPoint3dAltitude(pt).frame).toBe("msl");
    });

    it("updateRallyAltitudeFrame to terrain resets altitude", () => {
        const plan: RallyPlan = { points: [makeRallyPoint(47.5, 8.55, 50)] };
        const liveScope = scope("rally-frame-terrain", "live");
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "rally", plan, liveScope);

        const updated = updateRallyAltitudeFrame(state, 0, "terrain");
        const pt = typedDraftItems(updated, "rally")[0].document as GeoPoint3d;
        expect(pt).toHaveProperty("Terrain");
        expect(geoPoint3dAltitude(pt).value).toBe(0);
        expect(geoPoint3dAltitude(pt).frame).toBe("terrain");
    });
});

// ---------------------------------------------------------------------------
// Scope / recovery / dirty-tracking
// ---------------------------------------------------------------------------

describe("mission-draft-typed: scope and recovery", () => {
    it("does not move a clean mission draft to recoverable storage on scope change", () => {
        const liveScope = scope("live-clean", "live");
        const nextScope = scope("live-clean-2", "live");

        const plan: MissionPlan = { items: [] };
        const downloaded = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);
        const moved = moveDirtyDraftToRecoverable(downloaded, nextScope);

        expect(moved.recoverable.mission).toBeNull();
        expect((moved.active.mission.document as MissionPlan).items).toEqual([]);
        expect(isTypedDraftDirty(moved, "mission")).toBe(false);
    });

    it("moves dirty drafts to recoverable storage on scope changes and recovers them", () => {
        const initial = createTypedDraftState();
        const liveScope = scope("live-1", "live");
        const replacementScope = scope("replacement", "live", 3);

        const plan: MissionPlan = { items: [makeWaypoint(47.1, 8.1, 25)] };
        const downloaded = replaceTypedDraftFromDownload(initial, "mission", plan, liveScope);

        const dirtyPlan: MissionPlan = { items: [makeWaypoint(48.1, 9.1, 30)] };
        const dirty = replaceTypedDraftFromDownload(downloaded, "mission", dirtyPlan, liveScope, { markDirty: true });

        const moved = moveDirtyDraftToRecoverable(dirty, replacementScope);

        expect((moved.active.mission.document as MissionPlan).items).toEqual([]);
        expect(moved.recoverable.mission?.document).not.toBeNull();
        expect(moved.active.mission.scope).toEqual(replacementScope);

        const recovered = recoverTypedDraft(moved, "mission", liveScope);
        expect((recovered.active.mission.document as MissionPlan).items).toHaveLength(1);
        expect(recovered.recoverable.mission).toBeNull();
    });

    it("does not recover a draft into an incompatible scope", () => {
        const initial = createTypedDraftState();
        const liveScope = scope("vehicle-a", "live");
        const otherLiveScope = scope("vehicle-b", "live");

        const dirtyPlan: MissionPlan = { items: [makeWaypoint(48.1, 9.1, 30)] };
        const dirty = replaceTypedDraftFromDownload(initial, "mission", dirtyPlan, liveScope, { markDirty: true });

        const moved = moveDirtyDraftToRecoverable(dirty, scope("replacement", "live"));
        const recovered = recoverTypedDraft(moved, "mission", otherLiveScope);

        expect((recovered.active.mission.document as MissionPlan).items).toEqual([]);
        expect(recovered.recoverable.mission?.scope).toEqual(liveScope);
    });

    it("tracks dirty state correctly", () => {
        const liveScope = scope("dirty-test", "live");
        const plan: MissionPlan = { items: [makeWaypoint(47.1, 8.1, 25)] };
        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);

        expect(isTypedDraftDirty(state, "mission")).toBe(false);

        const updated = updateTypedAltitude(state, "mission", 0, 100);
        expect(isTypedDraftDirty(updated, "mission")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Add waypoint (no explicit position)
// ---------------------------------------------------------------------------

describe("mission-draft-typed: multi-selection and bulk helpers", () => {
    it("keeps single-selection helpers derived from the primary multi-selection item", () => {
        const liveScope = scope("multi-primary", "live");
        const plan: MissionPlan = {
            items: [
                makeWaypoint(47.1, 8.1, 25),
                makeWaypoint(47.2, 8.2, 30),
                makeWaypoint(47.3, 8.3, 35),
            ],
        };

        const loaded = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);
        const selected = selectTypedDraftIndex(loaded, "mission", 0);
        const toggled = toggleTypedDraftSelection(selected, "mission", 2);

        expect(typedDraftSelectionCount(toggled, "mission")).toBe(2);
        expect(typedDraftSelectedIndices(toggled, "mission")).toEqual([0, 2]);
        expect(typedDraftSelectedIndex(toggled, "mission")).toBe(2);
        expect(typedDraftItems(toggled, "mission")[typedDraftSelectedIndex(toggled, "mission") ?? -1]?.preview.latitude_deg).toBeCloseTo(47.3, 3);
    });

    it("selects an inclusive range and uses the clicked endpoint as the primary item", () => {
        const liveScope = scope("multi-range", "live");
        const plan: MissionPlan = {
            items: [
                makeWaypoint(47.1, 8.1, 25),
                makeWaypoint(47.2, 8.2, 30),
                makeWaypoint(47.3, 8.3, 35),
                makeWaypoint(47.4, 8.4, 40),
            ],
        };

        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);
        const selected = selectTypedDraftRange(state, "mission", 1, 3);

        expect(typedDraftSelectedIndices(selected, "mission")).toEqual([1, 2, 3]);
        expect(typedDraftSelectionCount(selected, "mission")).toBe(3);
        expect(typedDraftSelectedIndex(selected, "mission")).toBe(3);
    });

    it("bulk updates altitude for selected mission items and skips read-only entries", () => {
        const liveScope = scope("multi-alt", "live");
        const plan: MissionPlan = {
            items: [
                makeWaypoint(47.1, 8.1, 25),
                makeOtherItem(),
                makeWaypoint(47.3, 8.3, 35),
            ],
        };

        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);
        const uiIds = typedDraftItems(state, "mission").map((item) => item.uiId);
        const updated = bulkUpdateAltitude(state, "mission", uiIds, 120);

        const docs = typedDraftItems(updated, "mission").map((item) => item.document as MissionItem);
        expect(geoPoint3dAltitude(commandPosition(docs[0].command)!).value).toBe(120);
        expect("Other" in docs[1].command).toBe(true);
        expect(geoPoint3dAltitude(commandPosition(docs[2].command)!).value).toBe(120);
    });

    it("bulk deletes by stable uiIds and falls back to the next surviving selection", () => {
        const liveScope = scope("multi-delete", "live");
        const plan: MissionPlan = {
            items: [
                makeWaypoint(47.1, 8.1, 25),
                makeWaypoint(47.2, 8.2, 30),
                makeWaypoint(47.3, 8.3, 35),
                makeWaypoint(47.4, 8.4, 40),
            ],
        };

        const state = replaceTypedDraftFromDownload(createTypedDraftState(), "mission", plan, liveScope);
        const items = typedDraftItems(state, "mission");
        const updated = bulkDelete(state, "mission", [items[1].uiId, items[2].uiId]);

        expect(typedDraftItems(updated, "mission")).toHaveLength(2);
        expect(typedDraftSelectedIndex(updated, "mission")).toBe(1);
        expect(typedDraftSelectionCount(updated, "mission")).toBe(1);
        expect(typedDraftItems(updated, "mission")[1].preview.latitude_deg).toBeCloseTo(47.4, 3);
    });
});

describe("mission-draft-typed: addTypedWaypoint", () => {
    it("adds a default waypoint to an empty mission draft", () => {
        const state = createTypedDraftState();
        const updated = addTypedWaypoint(state, "mission");
        expect(typedDraftItems(updated, "mission")).toHaveLength(1);
    });

    it("adds a default rally point to an empty rally draft", () => {
        const state = createTypedDraftState();
        const updated = addTypedWaypoint(state, "rally");
        expect(typedDraftItems(updated, "rally")).toHaveLength(1);
    });

    it("adds a default fence region to an empty fence draft", () => {
        const state = createTypedDraftState();
        const updated = addTypedWaypoint(state, "fence");
        expect(typedDraftItems(updated, "fence")).toHaveLength(1);
        const region = typedDraftItems(updated, "fence")[0].document as FenceRegion;
        expect("inclusion_polygon" in region).toBe(true);
    });
});
