// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMockPlatformController } from "./backend";
import { listen } from "./event";
import type { PlaybackStateSnapshot } from "../../playback";
import type { SessionEvent } from "../../session";

describe("mock event adapter", () => {
  beforeEach(() => {
    getMockPlatformController().reset();
  });

  it("forwards playback payloads and unsubscribes cleanly", async () => {
    const controller = getMockPlatformController();
    const handler = vi.fn();
    const payload: SessionEvent<PlaybackStateSnapshot> = {
      envelope: {
        session_id: "playback-1",
        source_kind: "playback",
        seek_epoch: 1,
        reset_revision: 0,
      },
      value: {
        status: "seeking",
        entry_id: "entry-1",
        operation_id: "replay_seek",
        cursor_usec: 42000000,
        start_usec: 1000000,
        end_usec: 61000000,
        duration_secs: 60,
        speed: 1,
        available_speeds: [0.5, 1, 2, 4],
        barrier_ready: true,
        readonly: true,
        diagnostic: null,
      },
    };

    const unlisten = await listen<SessionEvent<PlaybackStateSnapshot>>(
      "playback://state",
      handler,
    );

    controller.emit("playback://state", payload);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ payload });

    unlisten();
    controller.emit("playback://state", {
      ...payload,
      value: {
        ...payload.value,
        cursor_usec: 43000000,
      },
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
