// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParamProgress, ParamStore } from "../params";
import type { SessionEnvelope, SessionEvent } from "../session";

const subscribeParamStore = vi.fn(async () => () => {});
const subscribeParamProgress = vi.fn(async () => () => {});
const subscribeSessionState = vi.fn(async () => () => {});
const fetchParamMetadata = vi.fn(async () => null);
const toast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
};

let sessionListener: ((event: { envelope: SessionEnvelope }) => void) | null = null;
let paramStoreListener: ((event: SessionEvent<ParamStore>) => void) | null = null;
let paramProgressListener: ((event: SessionEvent<ParamProgress>) => void) | null = null;

vi.mock("../params", () => ({
  downloadAllParams: vi.fn(),
  writeParam: vi.fn(),
  writeBatchParams: vi.fn(),
  parseParamFile: vi.fn(),
  formatParamFile: vi.fn(),
  subscribeParamStore,
  subscribeParamProgress,
}));

vi.mock("../session", () => ({
  subscribeSessionState,
}));

vi.mock("../param-metadata", () => ({
  fetchParamMetadata,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock("sonner", () => ({ toast }));

describe("useParams", () => {
  beforeEach(() => {
    sessionListener = null;
    paramStoreListener = null;
    paramProgressListener = null;

    subscribeParamStore.mockReset();
    subscribeParamProgress.mockReset();
    subscribeSessionState.mockReset();
    fetchParamMetadata.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    toast.warning.mockReset();

    subscribeParamStore.mockImplementation((async (cb: (event: SessionEvent<ParamStore>) => void) => {
      paramStoreListener = cb;
      return () => {
        paramStoreListener = null;
      };
    }) as never);
    subscribeParamProgress.mockImplementation((async (cb: (event: SessionEvent<ParamProgress>) => void) => {
      paramProgressListener = cb;
      return () => {
        paramProgressListener = null;
      };
    }) as never);
    subscribeSessionState.mockImplementation((async (cb: (event: { envelope: SessionEnvelope }) => void) => {
      sessionListener = cb;
      return () => {
        sessionListener = null;
      };
    }) as never);
  });

  it("hydrates param store and progress from grouped bootstrap values", async () => {
    const { useParams } = await import("./use-params");
    const bootstrapEnvelope: SessionEnvelope = {
      session_id: "live-bootstrap",
      source_kind: "live",
      seek_epoch: 3,
      reset_revision: 2,
    };
    const bootstrapStore: ParamStore = {
      expected_count: 2,
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
        FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
      },
    };
    const bootstrapProgress: ParamProgress = "completed";

    const { result } = renderHook(() => useParams(true, "copter", bootstrapEnvelope, bootstrapStore, bootstrapProgress));

    await waitFor(() => {
      expect(result.current.store).toEqual(bootstrapStore);
      expect(result.current.progress).toEqual(bootstrapProgress);
    });
    expect(result.current.paramList.map((param) => param.name)).toEqual(["ARMING_CHECK", "FS_THR_ENABLE"]);
  });

  it("ignores stale scoped param store events from an older envelope", async () => {
    const { useParams } = await import("./use-params");
    const currentEnvelope: SessionEnvelope = {
      session_id: "live-current",
      source_kind: "live",
      seek_epoch: 5,
      reset_revision: 4,
    };
    const staleEnvelope: SessionEnvelope = {
      session_id: "live-stale",
      source_kind: "live",
      seek_epoch: 4,
      reset_revision: 4,
    };
    const bootstrapStore: ParamStore = {
      expected_count: 1,
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
      },
    };
    const staleStore: ParamStore = {
      expected_count: 1,
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 0, param_type: "uint8", index: 0 },
      },
    };

    const { result } = renderHook(() => useParams(true, "copter", currentEnvelope, bootstrapStore, null));

    await waitFor(() => {
      expect(result.current.store).toEqual(bootstrapStore);
      expect(paramStoreListener).not.toBeNull();
      expect(sessionListener).not.toBeNull();
    });

    act(() => {
      sessionListener?.({ envelope: currentEnvelope });
      paramStoreListener?.({ envelope: staleEnvelope, value: staleStore });
    });

    expect(result.current.store).toEqual(bootstrapStore);
  });

  it("applies param progress only when the event matches the current session scope", async () => {
    const { useParams } = await import("./use-params");
    const currentEnvelope: SessionEnvelope = {
      session_id: "live-current",
      source_kind: "live",
      seek_epoch: 7,
      reset_revision: 1,
    };
    const olderEnvelope: SessionEnvelope = {
      session_id: "live-old",
      source_kind: "live",
      seek_epoch: 6,
      reset_revision: 1,
    };
    const staleProgress: ParamProgress = { downloading: { received: 1, expected: 10 } };
    const currentProgress: ParamProgress = { downloading: { received: 8, expected: 10 } };

    const { result } = renderHook(() => useParams(true, "copter", currentEnvelope, null, null));

    await waitFor(() => {
      expect(paramProgressListener).not.toBeNull();
      expect(sessionListener).not.toBeNull();
    });

    act(() => {
      sessionListener?.({ envelope: currentEnvelope });
      paramProgressListener?.({ envelope: olderEnvelope, value: staleProgress });
    });

    expect(result.current.progress).toBeNull();

    act(() => {
      paramProgressListener?.({ envelope: currentEnvelope, value: currentProgress });
    });

    expect(result.current.progress).toEqual(currentProgress);
  });

  it("ignores playback session events so live params stay scoped to the live envelope", async () => {
    const { useParams } = await import("./use-params");
    const liveEnvelope: SessionEnvelope = {
      session_id: "live-current",
      source_kind: "live",
      seek_epoch: 2,
      reset_revision: 1,
    };
    const playbackEnvelope: SessionEnvelope = {
      session_id: "playback-1",
      source_kind: "playback",
      seek_epoch: 9,
      reset_revision: 4,
    };
    const bootstrapStore: ParamStore = {
      expected_count: 1,
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
      },
    };
    const liveStoreUpdate: ParamStore = {
      expected_count: 1,
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 2, param_type: "uint8", index: 0 },
      },
    };

    const { result } = renderHook(() => useParams(true, "copter", liveEnvelope, bootstrapStore, null));

    await waitFor(() => {
      expect(result.current.store).toEqual(bootstrapStore);
      expect(sessionListener).not.toBeNull();
      expect(paramStoreListener).not.toBeNull();
    });

    act(() => {
      result.current.stage("ARMING_CHECK", 3);
    });

    expect(result.current.staged.get("ARMING_CHECK")).toBe(3);

    act(() => {
      sessionListener?.({ envelope: playbackEnvelope });
    });

    expect(result.current.store).toEqual(bootstrapStore);
    expect(result.current.staged.get("ARMING_CHECK")).toBe(3);

    act(() => {
      paramStoreListener?.({ envelope: liveEnvelope, value: liveStoreUpdate });
    });

    expect(result.current.store).toEqual(liveStoreUpdate);
  });

  it("ignores stale live session events so current live params stay active", async () => {
    const { useParams } = await import("./use-params");
    const currentLiveEnvelope: SessionEnvelope = {
      session_id: "live-current",
      source_kind: "live",
      seek_epoch: 8,
      reset_revision: 3,
    };
    const staleLiveEnvelope: SessionEnvelope = {
      session_id: "live-stale",
      source_kind: "live",
      seek_epoch: 7,
      reset_revision: 3,
    };
    const bootstrapStore: ParamStore = {
      expected_count: 1,
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
      },
    };
    const currentLiveStoreUpdate: ParamStore = {
      expected_count: 1,
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 2, param_type: "uint8", index: 0 },
      },
    };

    const { result } = renderHook(() => useParams(true, "copter", currentLiveEnvelope, bootstrapStore, null));

    await waitFor(() => {
      expect(result.current.store).toEqual(bootstrapStore);
      expect(sessionListener).not.toBeNull();
      expect(paramStoreListener).not.toBeNull();
    });

    act(() => {
      result.current.stage("ARMING_CHECK", 4);
      sessionListener?.({ envelope: staleLiveEnvelope });
    });

    expect(result.current.store).toEqual(bootstrapStore);
    expect(result.current.staged.get("ARMING_CHECK")).toBe(4);

    act(() => {
      paramStoreListener?.({ envelope: staleLiveEnvelope, value: { expected_count: 1, params: { ARMING_CHECK: { name: "ARMING_CHECK", value: 0, param_type: "uint8", index: 0 } } } });
      paramStoreListener?.({ envelope: currentLiveEnvelope, value: currentLiveStoreUpdate });
    });

    expect(result.current.store).toEqual(currentLiveStoreUpdate);
    expect(result.current.staged.get("ARMING_CHECK")).toBe(4);
  });
});
