import { useEffect, useState, useCallback, useMemo } from "react";
import {
  cancelMissionTransfer,
  clearMissionPlan,
  downloadMissionPlan,
  subscribeMissionState,
  setCurrentMissionItem,
  subscribeMissionProgress,
  uploadMissionPlan,
  validateMissionPlan,
  verifyMissionRoundtrip,
  type HomePosition,
  type MissionState,
  type MissionIssue,
  type MissionType,
  type TransferProgress,
} from "../mission";
import type { Telemetry } from "../telemetry";
import type { MissionFrame, MissionItem } from "../mission";
import { getVehicleSnapshot } from "../snapshot";
import { toast } from "sonner";
import {
  type DraftState,
  createEmptyDraft,
  wrapItems,
  addWaypoint as draftAddWaypoint,
  addWaypointAt as draftAddWaypointAt,
  insertBefore as draftInsertBefore,
  insertAfter as draftInsertAfter,
  deleteAt as draftDeleteAt,
  moveUp as draftMoveUp,
  moveDown as draftMoveDown,
  reorderItems as draftReorderItems,
  type NumericItemField,
  updateField as draftUpdateField,
  updateFrame as draftUpdateFrame,
  updateCoordinate as draftUpdateCoordinate,
  moveWaypointOnMap as draftMoveWaypointOnMap,
  insertItemsAfter as draftInsertItemsAfter,
  replaceAllItems as draftReplaceAllItems,
  selectBySeq,
  deriveSelectedSeq,
  buildPlan,
  rawItems,
  takeSnapshot,
  isDirty,
} from "../lib/mission-draft";

function asErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "unexpected error";
}

type HomeSource = "vehicle" | "user" | "download" | null;

export type TransferUi = {
  active: boolean;
  hasProgress: boolean;
  progressPct: number;
  direction: "upload" | "download" | null;
  completedItems: number;
  totalItems: number;
};

export function useMission(connected: boolean, telemetry: Telemetry, vehicleHomePosition: HomePosition | null) {
  const [draft, setDraft] = useState<DraftState>(createEmptyDraft);
  const [missionType, setMissionType] = useState<MissionType>("mission");
  const [homePosition, setHomePosition] = useState<HomePosition | null>(null);
  const [homeSource, setHomeSource] = useState<HomeSource>(null);
  const [homeLatInput, setHomeLatInput] = useState("");
  const [homeLonInput, setHomeLonInput] = useState("");
  const [homeAltInput, setHomeAltInput] = useState("");
  const [issues, setIssues] = useState<MissionIssue[]>([]);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [missionState, setMissionState] = useState<MissionState | null>(null);
  const [roundtripStatus, setRoundtripStatus] = useState<string>("");

  const items = useMemo(() => rawItems(draft), [draft]);
  const selectedSeq = useMemo(() => deriveSelectedSeq(draft), [draft]);
  const displayTotal = items.length;
  const dirty = useMemo(() => isDirty(draft, homePosition), [draft, homePosition]);

  const activeSeq = missionState?.current_seq ?? null;

  const transferActive =
    progress?.phase === "request_count" ||
    progress?.phase === "transfer_items" ||
    progress?.phase === "await_ack";

  const transferUi = useMemo<TransferUi>(() => {
    const hasProgress = progress !== null &&
      (progress.phase === "transfer_items" || progress.phase === "request_count");
    const progressPct = progress && progress.total_items > 0
      ? (progress.completed_items / progress.total_items) * 100
      : 0;
    return {
      active: transferActive,
      hasProgress,
      progressPct,
      direction: progress?.direction ?? null,
      completedItems: progress?.completed_items ?? 0,
      totalItems: progress?.total_items ?? 0,
    };
  }, [progress, transferActive]);

  useEffect(() => {
    if (!connected) {
      setMissionState(null);
      setProgress(null);
    }
  }, [connected]);

  useEffect(() => {
    if (vehicleHomePosition && homeSource !== "user") {
      setHomePosition(vehicleHomePosition);
      setHomeLatInput(vehicleHomePosition.latitude_deg.toFixed(6));
      setHomeLonInput(vehicleHomePosition.longitude_deg.toFixed(6));
      setHomeAltInput(vehicleHomePosition.altitude_m.toFixed(2));
      setHomeSource("vehicle");
    }
  }, [vehicleHomePosition]);

  useEffect(() => {
    let stopProgress: (() => void) | null = null;
    let stopState: (() => void) | null = null;

    (async () => {
      stopProgress = await subscribeMissionProgress(setProgress);
      stopState = await subscribeMissionState(setMissionState);

      try {
        const snapshot = await getVehicleSnapshot();
        if (snapshot) setMissionState(snapshot.mission_state);
      } catch {}
    })();

    return () => {
      stopProgress?.();
      stopState?.();
    };
  }, []);

  const setSelectedSeq = useCallback((seq: number | null) => {
    setDraft((prev) => selectBySeq(prev, seq));
  }, []);

  const addWaypoint = useCallback(() => {
    setDraft((prev) => draftAddWaypoint(prev, missionType));
  }, [missionType]);

  const addWaypointAt = useCallback((latDeg: number, lonDeg: number) => {
    setDraft((prev) => draftAddWaypointAt(prev, latDeg, lonDeg, missionType));
  }, [missionType]);

  const insertBefore = useCallback((index: number) => {
    setDraft((prev) => draftInsertBefore(prev, index, missionType));
  }, [missionType]);

  const insertAfter = useCallback((index: number) => {
    setDraft((prev) => draftInsertAfter(prev, index, missionType));
  }, [missionType]);

  const deleteAt = useCallback((index: number) => {
    setDraft((prev) => draftDeleteAt(prev, index));
  }, []);

  const moveUp = useCallback((index: number) => {
    setDraft((prev) => draftMoveUp(prev, index));
  }, []);

  const moveDown = useCallback((index: number) => {
    setDraft((prev) => draftMoveDown(prev, index));
  }, []);

  const reorderItemsFn = useCallback((fromUiId: number, toUiId: number) => {
    setDraft((prev) => draftReorderItems(prev, fromUiId, toUiId));
  }, []);

  const updateField = useCallback(
    (index: number, field: NumericItemField, value: number) => {
      setDraft((prev) => draftUpdateField(prev, index, field, value));
    },
    []
  );

  const updateFrame = useCallback(
    (index: number, frame: MissionFrame) => {
      setDraft((prev) => draftUpdateFrame(prev, index, frame));
    },
    []
  );

  const updateCoordinate = useCallback(
    (index: number, field: "x" | "y", valueDeg: number) => {
      setDraft((prev) => draftUpdateCoordinate(prev, index, field, valueDeg));
    },
    []
  );

  const moveWaypointOnMap = useCallback(
    (seq: number, latDeg: number, lonDeg: number) => {
      setDraft((prev) => draftMoveWaypointOnMap(prev, seq, latDeg, lonDeg));
    },
    []
  );

  const bulkInsertAfter = useCallback(
    (index: number, newItems: MissionItem[]) => {
      setDraft((prev) => draftInsertItemsAfter(prev, index, newItems));
    },
    []
  );

  const bulkReplace = useCallback(
    (newItems: MissionItem[]) => {
      setDraft((prev) => draftReplaceAllItems(prev, newItems));
    },
    []
  );

  const currentPlan = useCallback(
    () => buildPlan(draft, missionType, homePosition),
    [draft, missionType, homePosition]
  );

  const validate = useCallback(async () => {
    try {
      const result = await validateMissionPlan(currentPlan());
      setIssues(result);
      if (result.length === 0) toast.success("Plan valid");
    } catch (err) {
      toast.error("Validation failed", { description: asErrorMessage(err) });
    }
  }, [currentPlan]);

  const upload = useCallback(async () => {
    if (!connected) { toast.error("Connect to vehicle before upload"); return; }
    setProgress(null);
    try {
      const plan = currentPlan();
      await uploadMissionPlan(plan);
      setDraft((prev) => takeSnapshot(prev, homePosition));
      toast.success("Mission uploaded", { description: `${items.length} items` });
    } catch (err) {
      setProgress((prev) => prev && prev.phase !== "completed" && prev.phase !== "failed"
        ? { ...prev, phase: "failed" } : prev);
      toast.error("Upload failed", { description: asErrorMessage(err) });
    }
  }, [connected, currentPlan, homePosition, items.length]);

  const download = useCallback(async () => {
    if (!connected) { toast.error("Connect to vehicle before download"); return; }
    setProgress(null);
    try {
      const plan = await downloadMissionPlan(missionType);
      const newDraft: DraftState = {
        items: wrapItems(plan.items),
        selectedUiId: null,
        snapshot: { items: [], home: null },
      };
      const snapped: DraftState = takeSnapshot(newDraft, plan.home);
      setDraft(snapped);
      if (plan.home) {
        setHomePosition(plan.home);
        setHomeLatInput(plan.home.latitude_deg.toFixed(6));
        setHomeLonInput(plan.home.longitude_deg.toFixed(6));
        setHomeAltInput(plan.home.altitude_m.toFixed(2));
        setHomeSource("download");
      }
      setIssues([]);
      setRoundtripStatus("Downloaded");
      toast.success("Mission downloaded", { description: `${plan.items.length} items` });
    } catch (err) {
      setProgress((prev) => prev && prev.phase !== "completed" && prev.phase !== "failed"
        ? { ...prev, phase: "failed" } : prev);
      toast.error("Download failed", { description: asErrorMessage(err) });
    }
  }, [connected, missionType]);

  const clear = useCallback(async () => {
    if (!connected) { toast.error("Connect to vehicle before clear"); return; }
    setProgress(null);
    try {
      await clearMissionPlan(missionType);
      setDraft(createEmptyDraft());
      setHomePosition(null);
      setHomeSource(null);
      setHomeLatInput("");
      setHomeLonInput("");
      setHomeAltInput("");
      setIssues([]);
      setRoundtripStatus("Cleared");
      toast.success("Mission cleared");
    } catch (err) {
      setProgress((prev) => prev && prev.phase !== "completed" && prev.phase !== "failed"
        ? { ...prev, phase: "failed" } : prev);
      toast.error("Clear failed", { description: asErrorMessage(err) });
    }
  }, [connected, missionType]);

  const verify = useCallback(async () => {
    if (!connected) { toast.error("Connect to vehicle before verify"); return; }
    setProgress(null);
    setRoundtripStatus("Verifying...");
    try {
      const ok = await verifyMissionRoundtrip(currentPlan());
      setRoundtripStatus(ok ? "Roundtrip: pass" : "Roundtrip: fail");
      if (ok) {
        setDraft((prev) => takeSnapshot(prev, homePosition));
        toast.success("Roundtrip verified");
      } else {
        toast.warning("Roundtrip mismatch");
      }
    } catch (err) {
      setProgress((prev) => prev && prev.phase !== "completed" && prev.phase !== "failed"
        ? { ...prev, phase: "failed" } : prev);
      setRoundtripStatus("Verify failed");
      toast.error("Verify failed", { description: asErrorMessage(err) });
    }
  }, [connected, currentPlan, homePosition]);

  const cancel = useCallback(async () => {
    if (!connected) return;
    try {
      await cancelMissionTransfer();
    } catch (err) {
      toast.error("Cancel failed", { description: asErrorMessage(err) });
    } finally {
      setProgress((prev) => prev && prev.phase !== "completed" && prev.phase !== "failed" && prev.phase !== "cancelled"
        ? { ...prev, phase: "cancelled" } : prev);
    }
  }, [connected]);

  const setCurrent = useCallback(async (explicitSeq?: number) => {
    if (!connected) { toast.error("Connect first"); return; }
    const seq = explicitSeq ?? selectedSeq;
    if (seq === null) { toast.error("Select a waypoint first"); return; }
    try {
      await setCurrentMissionItem(seq);
    } catch (err) {
      toast.error("Set current failed", { description: asErrorMessage(err) });
    }
  }, [connected, selectedSeq]);

  const updateHomeFromVehicle = useCallback(() => {
    if (missionType !== "mission") return;
    const lat = telemetry.latitude_deg;
    const lon = telemetry.longitude_deg;
    if (typeof lat !== "number" || typeof lon !== "number" || Number.isNaN(lat) || Number.isNaN(lon)) {
      toast.error("Vehicle position unavailable");
      return;
    }
    const altitude = typeof telemetry.altitude_m === "number" && !Number.isNaN(telemetry.altitude_m) ? telemetry.altitude_m : 0;
    setHomePosition({ latitude_deg: lat, longitude_deg: lon, altitude_m: altitude });
    setHomeSource("vehicle");
    setHomeLatInput(lat.toFixed(6));
    setHomeLonInput(lon.toFixed(6));
    setHomeAltInput(altitude.toFixed(2));
  }, [missionType, telemetry]);

  const setArbitraryHome = useCallback(() => {
    if (missionType !== "mission") return;
    const lat = Number(homeLatInput);
    const lon = Number(homeLonInput);
    const alt = Number(homeAltInput || "0");
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt)) {
      toast.error("Home inputs must be valid numbers");
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      toast.error("Home coordinates out of range");
      return;
    }
    setHomePosition({ latitude_deg: lat, longitude_deg: lon, altitude_m: alt });
    setHomeSource("user");
  }, [missionType, homeLatInput, homeLonInput, homeAltInput]);

  const setHomeFromMap = useCallback(
    (latDeg: number, lonDeg: number) => {
      if (missionType !== "mission") return;
      const alt = homePosition?.altitude_m ?? 0;
      setHomePosition({ latitude_deg: latDeg, longitude_deg: lonDeg, altitude_m: alt });
      setHomeSource("user");
      setHomeLatInput(latDeg.toFixed(6));
      setHomeLonInput(lonDeg.toFixed(6));
      setHomeAltInput(alt.toFixed(2));
    },
    [missionType, homePosition?.altitude_m]
  );

  return {
    items,
    draftItems: draft.items,
    selectedSeq,
    setSelectedSeq,
    missionType,
    setMissionType,
    homePosition,
    homeSource,
    homeLatInput, setHomeLatInput,
    homeLonInput, setHomeLonInput,
    homeAltInput, setHomeAltInput,
    issues,
    progress,
    transferActive,
    transferUi,
    missionState,
    roundtripStatus,
    activeSeq,
    displayTotal,
    isDirty: dirty,
    addWaypoint,
    addWaypointAt,
    insertBefore,
    insertAfter,
    deleteAt,
    moveUp,
    moveDown,
    reorderItems: reorderItemsFn,
    updateField,
    updateFrame,
    updateCoordinate,
    moveWaypointOnMap,
    bulkInsertAfter,
    bulkReplace,
    validate,
    upload,
    download,
    clear,
    verify,
    cancel,
    setCurrent,
    updateHomeFromVehicle,
    setArbitraryHome,
    setHomeFromMap,
  };
}
