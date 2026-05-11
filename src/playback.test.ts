import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}));

vi.mock("@platform/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@platform/event", () => ({
  listen: listenMock,
}));

import {
  getFlightPath,
  getLogTelemetryTrack,
  pausePlayback,
  playPlayback,
  seekPlayback,
  setPlaybackSpeed,
  stopPlayback,
  subscribePlaybackState,
  type PlaybackStateSnapshot,
} from "./playback";
import type { SessionEvent } from "./session";

describe("playback bridge", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
  });

  it("forwards playback invoke commands", async () => {
    invokeMock.mockResolvedValue(undefined);

    await getFlightPath(25);
    await getLogTelemetryTrack(10);
    await playPlayback();
    await pausePlayback();
    await seekPlayback(123456);
    await setPlaybackSpeed(4);
    await stopPlayback();

    expect(invokeMock).toHaveBeenNthCalledWith(1, "log_get_flight_path", {
      maxPoints: 25,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "log_get_telemetry_track", {
      maxPoints: 10,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "playback_play");
    expect(invokeMock).toHaveBeenNthCalledWith(4, "playback_pause");
    expect(invokeMock).toHaveBeenNthCalledWith(5, "playback_seek", { cursorUsec: 123456 });
    expect(invokeMock).toHaveBeenNthCalledWith(6, "playback_set_speed", { speed: 4 });
    expect(invokeMock).toHaveBeenNthCalledWith(7, "playback_stop");
  });

  it("unwraps playback state subscription payloads", async () => {
    const payload: SessionEvent<PlaybackStateSnapshot> = {
      envelope: {
        session_id: "playback-1",
        source_kind: "playback",
        seek_epoch: 2,
        reset_revision: 0,
      },
      value: {
        status: "paused",
        entry_id: "entry-1",
        operation_id: "replay_pause",
        cursor_usec: 42000000,
        start_usec: 1000000,
        end_usec: 61000000,
        duration_secs: 60,
        speed: 2,
        available_speeds: [0.5, 1, 2, 4],
        barrier_ready: true,
        readonly: true,
        diagnostic: null,
      },
    };
    const unlisten = vi.fn();
    const cb = vi.fn();

    listenMock.mockImplementation(async (_event, handler) => {
      handler({ payload });
      return unlisten;
    });

    const dispose = await subscribePlaybackState(cb);

    expect(listenMock).toHaveBeenCalledWith("playback://state", expect.any(Function));
    expect(cb).toHaveBeenCalledWith(payload);
    expect(dispose).toBe(unlisten);
  });
});
