// @vitest-environment jsdom
import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionState, TransferProgress } from "../mission";
import type { SessionEnvelope, SessionEvent } from "../session";

const openDialog = vi.fn();
const saveDialog = vi.fn();
const readTextFile = vi.fn();
const writeTextFile = vi.fn();
const readFile = vi.fn();

const uploadMission = vi.fn();
const downloadMission = vi.fn();
const clearMission = vi.fn();
const validateMission = vi.fn();
const cancelMissionTransfer = vi.fn();
const setCurrentMissionItem = vi.fn();
const subscribeMissionProgress = vi.fn(async () => () => { });
const subscribeMissionState = vi.fn(async () => () => { });
const subscribeSessionState = vi.fn(async () => () => { });

const uploadFence = vi.fn();
const downloadFence = vi.fn();
const clearFence = vi.fn();

const uploadRally = vi.fn();
const downloadRally = vi.fn();
const clearRally = vi.fn();

const toast = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
};

let resolveMissionUpload: (() => void) | null = null;
let resolveMissionDownload: ((value: { plan: { items: [] }; home: { latitude_deg: number; longitude_deg: number; altitude_m: number } | null }) => void) | null = null;

let sessionListener: ((event: { envelope: SessionEnvelope }) => void) | null = null;
let missionStateListener: ((event: SessionEvent<MissionState>) => void) | null = null;
let missionProgressListener: ((event: SessionEvent<TransferProgress>) => void) | null = null;

vi.mock("../mission", () => ({
    cancelMissionTransfer,
    clearMission,
    downloadMission,
    subscribeMissionState,
    setCurrentMissionItem,
    subscribeMissionProgress,
    uploadMission,
    validateMission,
}));

vi.mock("../fence", () => ({
    clearFence,
    downloadFence,
    uploadFence,
}));

vi.mock("../rally", () => ({
    clearRally,
    downloadRally,
    uploadRally,
}));

vi.mock("../session", () => ({
    subscribeSessionState,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
    open: openDialog,
    save: saveDialog,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
    readTextFile,
    writeTextFile,
    readFile,
}));

vi.mock("sonner", () => ({ toast }));

describe("useMission", () => {
    beforeEach(() => {
        sessionListener = null;
        missionStateListener = null;
        missionProgressListener = null;
        for (const mock of [
            openDialog,
            saveDialog,
            readTextFile,
            writeTextFile,
            readFile,
            uploadMission,
            downloadMission,
            clearMission,
            validateMission,
            cancelMissionTransfer,
            setCurrentMissionItem,
            subscribeMissionProgress,
            subscribeMissionState,
            subscribeSessionState,
            uploadFence,
            downloadFence,
            clearFence,
            uploadRally,
            downloadRally,
            clearRally,
            toast.success,
            toast.error,
            toast.warning,
        ]) {
            mock.mockReset();
        }

        subscribeMissionProgress.mockImplementation((async (cb: (event: SessionEvent<TransferProgress>) => void) => {
            missionProgressListener = cb;
            return () => {
                missionProgressListener = null;
            };
        }) as never);
        subscribeMissionState.mockImplementation((async (cb: (event: SessionEvent<MissionState>) => void) => {
            missionStateListener = cb;
            return () => {
                missionStateListener = null;
            };
        }) as never);
        subscribeSessionState.mockImplementation((async (cb: (event: { envelope: SessionEnvelope }) => void) => {
            sessionListener = cb;
            return () => {
                sessionListener = null;
            };
        }) as never);
        resolveMissionUpload = null;
        resolveMissionDownload = null;
        uploadMission.mockImplementation(() => new Promise<void>((resolve) => {
            resolveMissionUpload = resolve;
        }));
        downloadMission.mockImplementation(() => new Promise((resolve) => {
            resolveMissionDownload = resolve;
        }));
        uploadFence.mockImplementation(() => new Promise(() => { }));
        uploadRally.mockImplementation(() => new Promise(() => { }));
    });

    function createDeferred<T>() {
        let resolve!: (value: T) => void;
        let reject!: (reason?: unknown) => void;
        const promise = new Promise<T>((resolvePromise, rejectPromise) => {
            resolve = resolvePromise;
            reject = rejectPromise;
        });

        return { promise, resolve, reject };
    }

    it("hydrates mission state from grouped bootstrap values before any stream event", async () => {
        const { useMission } = await import("./use-mission");
        const bootstrapEnvelope = {
            session_id: "live-bootstrap",
            source_kind: "live" as const,
            seek_epoch: 3,
            reset_revision: 2,
        };
        const bootstrapMissionState: MissionState = { plan: null, current_index: 4, sync: "current", active_op: null };

        const { result } = renderHook(() => useMission(true, {} as never, null, bootstrapEnvelope, bootstrapMissionState));

        await waitFor(() => {
            expect(result.current.vehicle.missionState).toEqual(bootstrapMissionState);
            expect(result.current.vehicle.activeSeq).toBe(4);
        });
    });

    it("tracks operations per domain and rejects conflicting operations within the same domain", async () => {
        const { useMission } = await import("./use-mission");
        const { result } = renderHook(() => useMission(true, {} as never, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
            });
            result.current.mission.addWaypoint();
        });

        act(() => {
            void result.current.mission.upload();
        });

        await waitFor(() => expect(uploadMission).toHaveBeenCalledTimes(1));
        expect(result.current.mission.operation.active).toBe(true);

        act(() => {
            void result.current.mission.upload();
        });

        expect(uploadMission).toHaveBeenCalledTimes(1);
        expect(toast.error).toHaveBeenCalledWith("Mission operation already in progress");

        act(() => {
            result.current.selectTab("fence");
            result.current.fence.addWaypoint();
            void result.current.fence.upload();
        });

        await waitFor(() => expect(uploadFence).toHaveBeenCalledTimes(1));
        expect(result.current.fence.operation.active).toBe(true);
        expect(result.current.rally.operation.active).toBe(false);
    });

    it("cancels pending domain operations and keeps dirty drafts recoverable on session changes", async () => {
        const { useMission } = await import("./use-mission");
        const { result } = renderHook(() => useMission(true, {} as never, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
            });
            result.current.mission.addWaypoint();
            void result.current.mission.upload();
        });

        await waitFor(() => expect(uploadMission).toHaveBeenCalledTimes(1));
        expect(result.current.mission.draftItems).toHaveLength(1);
        expect(result.current.mission.operation.active).toBe(true);

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-2", source_kind: "live", seek_epoch: 0, reset_revision: 1 },
            });
        });

        await waitFor(() => {
            expect(result.current.mission.operation.active).toBe(false);
            expect(result.current.mission.draftItems).toEqual([]);
        });

        act(() => {
            void result.current.mission.upload();
        });

        await waitFor(() => expect(uploadMission).toHaveBeenCalledTimes(2));
    });

    it("ignores stale async results after a scope change", async () => {
        const { useMission } = await import("./use-mission");
        const { result } = renderHook(() => useMission(true, {} as never, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
            });
            result.current.mission.addWaypoint();
            void result.current.mission.download();
        });

        await waitFor(() => {
            expect(downloadMission).toHaveBeenCalledTimes(1);
        });

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-2", source_kind: "live", seek_epoch: 0, reset_revision: 1 },
            });
        });

        await waitFor(() => expect(result.current.mission.draftItems).toEqual([]));

        await act(async () => {
            resolveMissionDownload?.({
                plan: { items: [] },
                home: { latitude_deg: 10, longitude_deg: 20, altitude_m: 30 },
            });
            resolveMissionUpload?.();
            await Promise.resolve();
        });

        expect(result.current.mission.roundtripStatus).toBe("");
        expect(result.current.mission.homePosition).toBeNull();
        expect(result.current.mission.draftItems).toEqual([]);
    });

    it("ignores stale mission state envelopes after a session switch", async () => {
        const { useMission } = await import("./use-mission");
        const { result } = renderHook(() => useMission(true, {} as never, null));

        const firstEnvelope = {
            session_id: "live-mission-1",
            source_kind: "live" as const,
            seek_epoch: 0,
            reset_revision: 0,
        };
        const secondEnvelope = {
            session_id: "live-mission-2",
            source_kind: "live" as const,
            seek_epoch: 1,
            reset_revision: 1,
        };

        await waitFor(() => {
            expect(sessionListener).not.toBeNull();
            expect(missionStateListener).not.toBeNull();
        });

        act(() => {
            sessionListener?.({ envelope: firstEnvelope });
            missionStateListener?.({
                envelope: firstEnvelope,
                value: { plan: null, current_index: 1, sync: "current", active_op: null },
            });
        });

        await waitFor(() => expect(result.current.vehicle.activeSeq).toBe(1));

        act(() => {
            sessionListener?.({ envelope: secondEnvelope });
            missionStateListener?.({
                envelope: secondEnvelope,
                value: { plan: null, current_index: 2, sync: "current", active_op: null },
            });
        });

        await waitFor(() => expect(result.current.vehicle.activeSeq).toBe(2));

        act(() => {
            missionStateListener?.({
                envelope: firstEnvelope,
                value: { plan: null, current_index: 9, sync: "current", active_op: null },
            });
        });

        expect(result.current.vehicle.missionState).toEqual({ plan: null, current_index: 2, sync: "current", active_op: null });
        expect(result.current.vehicle.activeSeq).toBe(2);
    });

    it("only applies mission progress when the scoped envelope matches the current session", async () => {
        const { useMission } = await import("./use-mission");
        const { result } = renderHook(() => useMission(true, {} as never, null));

        const firstEnvelope = {
            session_id: "live-progress-1",
            source_kind: "live" as const,
            seek_epoch: 0,
            reset_revision: 0,
        };
        const secondEnvelope = {
            session_id: "live-progress-2",
            source_kind: "live" as const,
            seek_epoch: 1,
            reset_revision: 1,
        };

        await waitFor(() => {
            expect(sessionListener).not.toBeNull();
            expect(missionProgressListener).not.toBeNull();
        });

        act(() => {
            sessionListener?.({ envelope: firstEnvelope });
            missionProgressListener?.({
                envelope: firstEnvelope,
                value: {
                    direction: "upload",
                    mission_type: "mission",
                    phase: "transfer_items",
                    completed_items: 1,
                    total_items: 4,
                    retries_used: 0,
                },
            });
        });

        await waitFor(() => {
            expect(result.current.mission.transferUi.active).toBe(true);
            expect(result.current.mission.transferUi.progressPct).toBe(25);
        });

        act(() => {
            sessionListener?.({ envelope: secondEnvelope });
        });

        await waitFor(() => {
            expect(result.current.mission.transferUi.active).toBe(false);
            expect(result.current.mission.transferUi.hasProgress).toBe(false);
            expect(result.current.mission.transferUi.progressPct).toBe(0);
        });

        act(() => {
            missionProgressListener?.({
                envelope: firstEnvelope,
                value: {
                    direction: "upload",
                    mission_type: "mission",
                    phase: "transfer_items",
                    completed_items: 3,
                    total_items: 4,
                    retries_used: 0,
                },
            });
        });

        expect(result.current.mission.transferUi.active).toBe(false);
        expect(result.current.mission.transferUi.hasProgress).toBe(false);
        expect(result.current.mission.transferUi.progressPct).toBe(0);

        act(() => {
            missionProgressListener?.({
                envelope: secondEnvelope,
                value: {
                    direction: "download",
                    mission_type: "mission",
                    phase: "transfer_items",
                    completed_items: 2,
                    total_items: 5,
                    retries_used: 1,
                },
            });
        });

        await waitFor(() => {
            expect(result.current.mission.transferUi.active).toBe(true);
            expect(result.current.mission.transferUi.direction).toBe("download");
            expect(result.current.mission.transferUi.progressPct).toBe(40);
            expect(result.current.mission.transferUi.completedItems).toBe(2);
            expect(result.current.mission.transferUi.totalItems).toBe(5);
        });
    });

    it("ignores stale mission events across disconnect and disconnected rebootstrap", async () => {
        const { useMission } = await import("./use-mission");
        const firstEnvelope: SessionEnvelope = {
            session_id: "live-scope-a",
            source_kind: "live",
            seek_epoch: 0,
            reset_revision: 0,
        };
        const secondEnvelope: SessionEnvelope = {
            session_id: "live-scope-b",
            source_kind: "live",
            seek_epoch: 1,
            reset_revision: 1,
        };
        const bootstrapMissionState: MissionState = { plan: null, current_index: 7, sync: "current", active_op: null };

        const { result, rerender } = renderHook(
            ({ connected, bootstrapScope, bootstrapState }) => useMission(connected, {} as never, null, bootstrapScope, bootstrapState),
            {
                initialProps: {
                    connected: true,
                    bootstrapScope: null as SessionEnvelope | null,
                    bootstrapState: null as MissionState | null,
                },
            },
        );

        await waitFor(() => {
            expect(sessionListener).not.toBeNull();
            expect(missionStateListener).not.toBeNull();
            expect(missionProgressListener).not.toBeNull();
        });

        act(() => {
            sessionListener?.({ envelope: firstEnvelope });
            missionStateListener?.({ envelope: firstEnvelope, value: { plan: null, current_index: 2, sync: "current", active_op: null } });
            missionProgressListener?.({
                envelope: firstEnvelope,
                value: {
                    direction: "upload",
                    mission_type: "mission",
                    phase: "transfer_items",
                    completed_items: 2,
                    total_items: 5,
                    retries_used: 0,
                },
            });
        });

        await waitFor(() => {
            expect(result.current.vehicle.missionState).toEqual({ plan: null, current_index: 2, sync: "current", active_op: null });
            expect(result.current.mission.transferUi.progressPct).toBe(40);
        });

        rerender({ connected: false, bootstrapScope: null, bootstrapState: null });

        await waitFor(() => {
            expect(result.current.vehicle.missionState).toBeNull();
            expect(result.current.mission.transferUi.active).toBe(false);
            expect(result.current.mission.transferUi.progressPct).toBe(0);
        });

        act(() => {
            missionStateListener?.({ envelope: firstEnvelope, value: { plan: null, current_index: 9, sync: "current", active_op: null } });
            missionProgressListener?.({
                envelope: firstEnvelope,
                value: {
                    direction: "upload",
                    mission_type: "mission",
                    phase: "transfer_items",
                    completed_items: 4,
                    total_items: 5,
                    retries_used: 0,
                },
            });
        });

        expect(result.current.vehicle.missionState).toBeNull();
        expect(result.current.mission.transferUi.active).toBe(false);
        expect(result.current.mission.transferUi.progressPct).toBe(0);

        rerender({ connected: false, bootstrapScope: secondEnvelope, bootstrapState: bootstrapMissionState });

        await waitFor(() => expect(result.current.vehicle.missionState).toEqual(bootstrapMissionState));

        act(() => {
            missionStateListener?.({ envelope: firstEnvelope, value: { plan: null, current_index: 11, sync: "current", active_op: null } });
            missionProgressListener?.({
                envelope: firstEnvelope,
                value: {
                    direction: "download",
                    mission_type: "mission",
                    phase: "transfer_items",
                    completed_items: 5,
                    total_items: 5,
                    retries_used: 0,
                },
            });
        });

        expect(result.current.vehicle.missionState).toEqual(bootstrapMissionState);
        expect(result.current.mission.transferUi.active).toBe(false);
        expect(result.current.mission.transferUi.progressPct).toBe(0);

        act(() => {
            missionStateListener?.({ envelope: secondEnvelope, value: { plan: null, current_index: 3, sync: "current", active_op: null } });
            missionProgressListener?.({
                envelope: secondEnvelope,
                value: {
                    direction: "download",
                    mission_type: "mission",
                    phase: "transfer_items",
                    completed_items: 3,
                    total_items: 6,
                    retries_used: 1,
                },
            });
        });

        await waitFor(() => {
            expect(result.current.vehicle.missionState).toEqual({ plan: null, current_index: 3, sync: "current", active_op: null });
            expect(result.current.mission.transferUi.direction).toBe("download");
            expect(result.current.mission.transferUi.progressPct).toBe(50);
        });
    });

    it("cleans up late mission subscriptions that resolve after unmount", async () => {
        const { useMission } = await import("./use-mission");
        const progressDeferred = createDeferred<() => void>();
        const stateDeferred = createDeferred<() => void>();
        const sessionDeferred = createDeferred<() => void>();
        const stopProgress = vi.fn();
        const stopState = vi.fn();
        const stopSession = vi.fn();

        subscribeMissionProgress.mockImplementationOnce((async () => progressDeferred.promise) as never);
        subscribeMissionState.mockImplementationOnce((async () => stateDeferred.promise) as never);
        subscribeSessionState.mockImplementationOnce((async () => sessionDeferred.promise) as never);

        const { unmount } = renderHook(() => useMission(true, {} as never, null));

        unmount();

        await act(async () => {
            progressDeferred.resolve(stopProgress);
            stateDeferred.resolve(stopState);
            sessionDeferred.resolve(stopSession);
            await Promise.resolve();
        });

        expect(stopProgress).toHaveBeenCalledTimes(1);
        expect(stopState).toHaveBeenCalledTimes(1);
        expect(stopSession).toHaveBeenCalledTimes(1);
    });

    it("handles rejected mission subscription setup without unhandled rejections", async () => {
        const { useMission } = await import("./use-mission");
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });

        subscribeMissionState.mockRejectedValueOnce(new Error("mission state subscribe failed"));

        renderHook(() => useMission(true, {} as never, null));

        await waitFor(() => {
            expect(warnSpy).toHaveBeenCalledWith(
                "Mission subscription setup failed",
                expect.objectContaining({ message: "mission state subscribe failed" }),
            );
        });

        warnSpy.mockRestore();
    });

    it("automatically cancels active transfers on scope invalidation and disconnect", async () => {
        const { useMission } = await import("./use-mission");
        const { result, rerender } = renderHook(({ connected }) => useMission(connected, {} as never, null), {
            initialProps: { connected: true },
        });

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-cancel", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
            });
            result.current.mission.addWaypoint();
            void result.current.mission.upload();
        });

        await waitFor(() => expect(uploadMission).toHaveBeenCalledTimes(1));

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-cancel-2", source_kind: "live", seek_epoch: 0, reset_revision: 1 },
            });
        });

        await waitFor(() => expect(cancelMissionTransfer).toHaveBeenCalledTimes(1));

        rerender({ connected: false });

        await waitFor(() => expect(cancelMissionTransfer).toHaveBeenCalledTimes(2));

        await act(async () => {
            resolveMissionUpload?.();
            await Promise.resolve();
        });

        expect(result.current.mission.draftItems).toEqual([]);
    });

    it("treats playback sessions as read-only for mutating actions", async () => {
        const { useMission } = await import("./use-mission");
        const { result } = renderHook(() => useMission(true, {} as never, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "playback-1", source_kind: "playback", seek_epoch: 1, reset_revision: 1 },
            });
            result.current.mission.addWaypoint();
            void result.current.mission.upload();
            void result.current.mission.clear();
        });

        expect(uploadMission).not.toHaveBeenCalled();
        expect(clearMission).not.toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalledWith("Mission is read-only in playback");
    });

    it("blocks local draft and home mutations in playback", async () => {
        const { useMission } = await import("./use-mission");
        const { result } = renderHook(() => useMission(true, { latitude_deg: 1, longitude_deg: 2, altitude_m: 3 } as never, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        const typedItem = {
            command: { Nav: { Waypoint: { position: { RelHome: { latitude_deg: 1, longitude_deg: 2, relative_alt_m: 3 } }, hold_time_s: 0, acceptance_radius_m: 1, pass_radius_m: 0, yaw_deg: 0 } } },
            current: true,
            autocontinue: true,
        };

        act(() => {
            sessionListener?.({
                envelope: { session_id: "playback-2", source_kind: "playback", seek_epoch: 2, reset_revision: 2 },
            });
            result.current.mission.addWaypoint();
            result.current.mission.addWaypointAt(10, 20);
            result.current.mission.insertBefore(0);
            result.current.mission.insertAfter(0);
            result.current.mission.replaceAll([typedItem]);
            result.current.mission.undo();
            result.current.mission.redo();
            result.current.mission.setWaypointFromVehicle(0);
            result.current.mission.setHomeLatInput("47.1");
            result.current.mission.setHomeLonInput("8.1");
            result.current.mission.setHomeAltInput("500");
            result.current.mission.setArbitraryHome();
            result.current.mission.updateHomeFromVehicle();
            result.current.mission.setHomeFromMap(40, 50);
        });

        expect(result.current.mission.draftItems).toEqual([]);
        expect(result.current.mission.homePosition).toBeNull();
        expect(result.current.mission.isDirty).toBe(false);
        expect(toast.error).toHaveBeenCalledWith("Mission is read-only in playback");
    });

    it("clears prior mission home when mission download returns home null", async () => {
        const { useMission } = await import("./use-mission");
        const { result } = renderHook(() => useMission(true, {} as never, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-home-clear", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
            });
        });

        downloadMission.mockResolvedValueOnce({
            plan: { items: [] },
            home: { latitude_deg: 47.1, longitude_deg: 8.1, altitude_m: 500 },
        });

        await act(async () => {
            await result.current.mission.download();
        });

        expect(result.current.mission.homePosition).toEqual({ latitude_deg: 47.1, longitude_deg: 8.1, altitude_m: 500 });

        downloadMission.mockResolvedValueOnce({
            plan: { items: [] },
            home: null,
        });

        await act(async () => {
            await result.current.mission.download();
        });

        expect(result.current.mission.homePosition).toBeNull();
    });

    it("preserves separate domain state when switching tabs", async () => {
        const { useMission } = await import("./use-mission");
        const { result } = renderHook(() => useMission(true, {} as never, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-tabs", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
            });
            result.current.mission.addWaypoint();
        });

        act(() => {
            result.current.selectTab("fence");
            result.current.fence.addWaypoint();
        });

        act(() => {
            result.current.selectTab("rally");
            result.current.rally.addWaypoint();
        });

        act(() => {
            result.current.selectTab("mission");
        });

        expect(result.current.current).toBe(result.current.mission);
        expect(result.current.current.draftItems).toHaveLength(1);
        expect(result.current.mission.draftItems).toHaveLength(1);
        expect(result.current.fence.draftItems).toHaveLength(1);
        expect(result.current.rally.draftItems).toHaveLength(1);
        expect(result.current.selectedTab).toBe("mission");
    });

    it("tracks undo and redo across waypoint and home edits", async () => {
        const { useMission } = await import("./use-mission");
        const telemetry = { latitude_deg: 47.55, longitude_deg: 8.55, altitude_m: 120 } as never;
        const { result } = renderHook(() => useMission(true, telemetry, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-undo", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
            });
            result.current.mission.addWaypoint();
            result.current.mission.updateHomeFromVehicle();
        });

        expect(result.current.mission.draftItems).toHaveLength(1);
        expect(result.current.mission.homePosition).toEqual({ latitude_deg: 47.55, longitude_deg: 8.55, altitude_m: 120 });
        expect(result.current.mission.canUndo).toBe(true);

        act(() => {
            result.current.mission.undo();
        });

        expect(result.current.mission.draftItems).toHaveLength(1);
        expect(result.current.mission.homePosition).toBeNull();
        expect(result.current.mission.canRedo).toBe(true);

        act(() => {
            result.current.mission.undo();
        });

        expect(result.current.mission.draftItems).toEqual([]);

        act(() => {
            result.current.mission.redo();
            result.current.mission.redo();
        });

        expect(result.current.mission.draftItems).toHaveLength(1);
        expect(result.current.mission.homePosition).toEqual({ latitude_deg: 47.55, longitude_deg: 8.55, altitude_m: 120 });
    });

    it("clears redo history after a new mutation and caps undo history at 50 snapshots", async () => {
        const { useMission } = await import("./use-mission");
        const { result } = renderHook(() => useMission(true, {} as never, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-history-cap", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
            });
            result.current.mission.addWaypoint();
            result.current.mission.addWaypoint();
        });

        act(() => {
            result.current.mission.undo();
        });

        expect(result.current.mission.canRedo).toBe(true);

        act(() => {
            result.current.mission.addWaypoint();
        });

        expect(result.current.mission.draftItems).toHaveLength(2);
        expect(result.current.mission.canRedo).toBe(false);

        act(() => {
            for (let index = 0; index < 53; index += 1) {
                result.current.mission.addWaypoint();
            }
        });

        expect(result.current.mission.draftItems).toHaveLength(55);

        act(() => {
            for (let index = 0; index < 55; index += 1) {
                result.current.mission.undo();
            }
        });

        expect(result.current.mission.draftItems).toHaveLength(5);
        expect(result.current.mission.canUndo).toBe(false);
    });

    it("resets history on scope changes, upload, download, and clear", async () => {
        const { useMission } = await import("./use-mission");
        const { result } = renderHook(() => useMission(true, {} as never, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-history-reset", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
            });
            result.current.mission.addWaypoint();
        });

        expect(result.current.mission.canUndo).toBe(true);

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-history-reset-2", source_kind: "live", seek_epoch: 0, reset_revision: 1 },
            });
        });

        expect(result.current.mission.canUndo).toBe(false);

        act(() => {
            result.current.mission.addWaypoint();
        });

        uploadMission.mockResolvedValueOnce(undefined);
        await act(async () => {
            await result.current.mission.upload();
        });
        expect(result.current.mission.canUndo).toBe(false);

        act(() => {
            result.current.mission.addWaypoint();
        });

        downloadMission.mockResolvedValueOnce({ plan: { items: [] }, home: null });
        await act(async () => {
            await result.current.mission.download();
        });
        expect(result.current.mission.canUndo).toBe(false);

        act(() => {
            result.current.mission.addWaypoint();
        });

        clearMission.mockResolvedValueOnce(undefined);
        await act(async () => {
            await result.current.mission.clear();
        });
        expect(result.current.mission.canUndo).toBe(false);
    });

    it("imports a QGC plan file atomically across mission, fence, rally, and home while resetting undo history", async () => {
        const { useMission } = await import("./use-mission");
        const { exportPlanFile: buildPlanFile } = await import("../lib/mission-plan-io");
        const { result } = renderHook(() => useMission(true, { latitude_deg: 47.55, longitude_deg: 8.55, altitude_m: 120 } as never, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-plan-import", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
            });
            result.current.mission.addWaypoint();
            result.current.fence.addWaypoint();
            result.current.rally.addWaypoint();
            result.current.mission.updateHomeFromVehicle();
        });

        expect(result.current.mission.canUndo).toBe(true);
        expect(result.current.fence.canUndo).toBe(true);
        expect(result.current.rally.canUndo).toBe(true);

        const fixture = buildPlanFile({
            mission: {
                items: [{
                    command: {
                        Nav: {
                            Waypoint: {
                                position: { RelHome: { latitude_deg: 40.1, longitude_deg: -73.2, relative_alt_m: 75 } },
                                hold_time_s: 2,
                                acceptance_radius_m: 1,
                                pass_radius_m: 0,
                                yaw_deg: 15,
                            },
                        },
                    },
                    current: true,
                    autocontinue: true,
                }],
            },
            home: { latitude_deg: 40.12, longitude_deg: -73.25, altitude_m: 12 },
            fence: {
                return_point: null,
                regions: [{
                    inclusion_polygon: {
                        vertices: [
                            { latitude_deg: 40.1, longitude_deg: -73.2 },
                            { latitude_deg: 40.11, longitude_deg: -73.21 },
                            { latitude_deg: 40.12, longitude_deg: -73.19 },
                        ],
                        inclusion_group: 0,
                    },
                }],
            },
            rally: {
                points: [{
                    RelHome: { latitude_deg: 40.15, longitude_deg: -73.18, relative_alt_m: 30 },
                }],
            },
            cruiseSpeed: 22,
            hoverSpeed: 6,
        });

        openDialog.mockResolvedValueOnce("/tmp/import.plan");
        readTextFile.mockResolvedValueOnce(JSON.stringify(fixture.json));

        await act(async () => {
            await result.current.importPlanFile();
        });

        expect(openDialog).toHaveBeenCalledWith({
            filters: [{ name: "QGC Plan", extensions: ["plan"] }],
            multiple: false,
        });
        expect(readTextFile).toHaveBeenCalledWith("/tmp/import.plan");

        // Because the editor already had content, import pauses for user confirmation.
        expect(result.current.pendingImport).not.toBeNull();

        act(() => {
            result.current.confirmImport("replace");
        });

        expect(result.current.pendingImport).toBeNull();
        expect(result.current.mission.draftItems).toHaveLength(1);
        expect(result.current.fence.draftItems).toHaveLength(1);
        expect(result.current.rally.draftItems).toHaveLength(1);
        expect(result.current.mission.homePosition).toEqual({ latitude_deg: 40.12, longitude_deg: -73.25, altitude_m: 12 });
        expect(result.current.mission.importedSpeeds).toEqual({ cruiseSpeedMps: 22, hoverSpeedMps: 6 });
        expect(result.current.mission.canUndo).toBe(false);
        expect(result.current.fence.canUndo).toBe(false);
        expect(result.current.rally.canUndo).toBe(false);

        act(() => {
            result.current.mission.undo();
            result.current.fence.undo();
            result.current.rally.undo();
        });

        expect(result.current.mission.draftItems).toHaveLength(1);
        expect(result.current.fence.draftItems).toHaveLength(1);
        expect(result.current.rally.draftItems).toHaveLength(1);
    });

    it("exports the current mission, fence, rally, and home state to a QGC plan file", async () => {
        const { useMission } = await import("./use-mission");
        const { result } = renderHook(() => useMission(true, { latitude_deg: 47.55, longitude_deg: 8.55, altitude_m: 120 } as never, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-plan-export", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
            });
            result.current.mission.addWaypoint();
            result.current.fence.addWaypoint();
            result.current.rally.addWaypoint();
            result.current.mission.updateHomeFromVehicle();
            result.current.mission.setExportSpeeds({ cruiseSpeedMps: 24, hoverSpeedMps: 8 });
        });

        saveDialog.mockResolvedValueOnce("/tmp/export.plan");

        await act(async () => {
            await result.current.exportPlanFile();
        });

        expect(saveDialog).toHaveBeenCalledWith({
            filters: [{ name: "QGC Plan", extensions: ["plan"] }],
            defaultPath: "mission.plan",
        });
        expect(writeTextFile).toHaveBeenCalledTimes(1);
        expect(writeTextFile).toHaveBeenCalledWith("/tmp/export.plan", expect.any(String));

        const exportedJson = JSON.parse(writeTextFile.mock.calls[0][1] as string) as {
            fileType?: string;
            mission?: { items?: unknown[]; plannedHomePosition?: number[]; cruiseSpeed?: number; hoverSpeed?: number };
            geoFence?: { polygons?: unknown[]; circles?: unknown[] };
            rallyPoints?: { points?: unknown[] };
        };
        expect(exportedJson.fileType).toBe("Plan");
        expect(exportedJson.mission?.items).toHaveLength(1);
        expect(exportedJson.mission?.plannedHomePosition).toEqual([47.55, 8.55, 120]);
        expect(exportedJson.mission?.cruiseSpeed).toBe(24);
        expect(exportedJson.mission?.hoverSpeed).toBe(8);
        expect((exportedJson.geoFence?.polygons?.length ?? 0) + (exportedJson.geoFence?.circles?.length ?? 0)).toBe(1);
        expect(exportedJson.rallyPoints?.points).toHaveLength(1);
    });

    it("imports KML geometry into mission and fence drafts while resetting affected undo histories", async () => {
        const { useMission } = await import("./use-mission");
        const { result } = renderHook(() => useMission(true, {} as never, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-kml-import", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
            });
            result.current.mission.addWaypoint();
            result.current.fence.addWaypoint();
        });

        expect(result.current.mission.canUndo).toBe(true);
        expect(result.current.fence.canUndo).toBe(true);

        openDialog.mockResolvedValueOnce("/tmp/import.kml");
        readTextFile.mockResolvedValueOnce(`
            <kml xmlns="http://www.opengis.net/kml/2.2">
              <Document>
                <Placemark>
                  <name>Boundary</name>
                  <Polygon>
                    <outerBoundaryIs>
                      <LinearRing>
                        <coordinates>
                          -73.2000,40.1000,0 -73.2100,40.1100,0 -73.1900,40.1200,0 -73.2000,40.1000,0
                        </coordinates>
                      </LinearRing>
                    </outerBoundaryIs>
                  </Polygon>
                </Placemark>
                <Placemark>
                  <name>Path</name>
                  <LineString>
                    <coordinates>
                      -73.2500,40.1500,0 -73.2600,40.1600,0 -73.2700,40.1700,0
                    </coordinates>
                  </LineString>
                </Placemark>
              </Document>
            </kml>
        `);

        await act(async () => {
            await result.current.importKmlFile();
        });

        expect(openDialog).toHaveBeenCalledWith({
            filters: [{ name: "KML/KMZ", extensions: ["kml", "kmz"] }],
            multiple: false,
        });
        expect(readTextFile).toHaveBeenCalledWith("/tmp/import.kml");
        expect(result.current.mission.draftItems).toHaveLength(3);
        expect(result.current.fence.draftItems).toHaveLength(1);
        expect(result.current.mission.canUndo).toBe(false);
        expect(result.current.fence.canUndo).toBe(false);
    });

    it("moves a waypoint from live telemetry GPS and exposes selection summaries", async () => {
        const { useMission } = await import("./use-mission");
        const telemetry = { latitude_deg: 40.1, longitude_deg: -73.2, altitude_m: 88 } as never;
        const { result } = renderHook(() => useMission(true, telemetry, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-gps", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
            });
            result.current.mission.addWaypoint();
            result.current.mission.select(0);
            result.current.mission.setWaypointFromVehicle(0);
        });

        expect(result.current.mission.selectedIndex).toBe(0);
        expect(result.current.mission.selectedIndices).toEqual([0]);
        expect(result.current.mission.selectedCount).toBe(1);
        expect(result.current.mission.draftItems[0].preview.latitude_deg).toBeCloseTo(40.1, 3);
        expect(result.current.mission.draftItems[0].preview.longitude_deg).toBeCloseTo(-73.2, 3);

        act(() => {
            result.current.mission.undo();
        });

        expect(result.current.mission.draftItems[0].preview.latitude_deg).not.toBeCloseTo(40.1, 3);
    });

    it("exposes multi-select helpers and bulk mission edits through the hook", async () => {
        const { useMission } = await import("./use-mission");
        const { result } = renderHook(() => useMission(true, {} as never, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-bulk-ui", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
            });
            result.current.mission.addWaypoint();
            result.current.mission.addWaypoint();
            result.current.mission.addWaypoint();
            result.current.mission.select(0);
            result.current.mission.toggleSelect(2);
        });

        expect(result.current.mission.selectedIndices).toEqual([0, 2]);
        expect(result.current.mission.selectedUiIds.size).toBe(2);
        expect(result.current.mission.selectionAnchorIndex).toBe(2);

        act(() => {
            result.current.mission.bulkUpdateAltitude(120);
        });

        expect(result.current.mission.draftItems[0].preview.altitude_m).toBe(120);
        expect(result.current.mission.draftItems[1].preview.altitude_m).toBe(25);
        expect(result.current.mission.draftItems[2].preview.altitude_m).toBe(120);

        act(() => {
            result.current.mission.bulkDelete();
        });

        expect(result.current.mission.draftItems).toHaveLength(1);
        expect(result.current.mission.selectedCount).toBe(1);
        expect(result.current.mission.selectedIndex).toBe(0);
        expect(result.current.mission.draftItems[0].preview.altitude_m).toBe(25);
    });

    it("rejects setWaypointFromVehicle when telemetry GPS is unavailable", async () => {
        const { useMission } = await import("./use-mission");
        const { result } = renderHook(() => useMission(true, {} as never, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-gps-missing", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
            });
            result.current.mission.addWaypoint();
            result.current.mission.setWaypointFromVehicle(0);
        });

        expect(toast.error).toHaveBeenCalledWith("Vehicle position unavailable");
        expect(result.current.mission.draftItems[0].preview.latitude_deg).toBeCloseTo(0, 3);
    });

    it("restricts setCurrent to the mission domain", async () => {
        const { useMission } = await import("./use-mission");
        const { result } = renderHook(() => useMission(true, {} as never, null));

        await waitFor(() => expect(sessionListener).not.toBeNull());

        act(() => {
            sessionListener?.({
                envelope: { session_id: "live-3", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
            });
            result.current.fence.addWaypoint();
        });

        expect("setCurrent" in result.current.fence).toBe(false);

        await act(async () => {
            await result.current.mission.setCurrent(0);
        });

        expect(setCurrentMissionItem).toHaveBeenCalledWith(0);
    });
});
