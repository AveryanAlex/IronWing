import { beforeEach, describe, expect, it, vi } from "vitest";

const { listen } = vi.hoisted(() => ({
  listen: vi.fn(),
}));

vi.mock("@platform/event", () => ({
  listen,
}));

import {
  readLiveStatusText,
  readPlaybackStatusText,
  subscribeStatusText,
  type StatusTextDomain,
} from "./statustext";

const statusText: StatusTextDomain = {
  available: true,
  complete: true,
  provenance: "stream",
  value: {
    entries: [
      { text: "Boot", severity: "info", timestamp_usec: 100 },
      { text: "Ready", severity: "notice", timestamp_usec: 200 },
      { text: "PreArm: GPS", severity: "warning", timestamp_usec: 300 },
    ],
  },
};

describe("status text", () => {
  beforeEach(() => {
    listen.mockReset();
  });

  it("reads live entries from the new domain contract", () => {
    expect(readLiveStatusText(statusText).map((entry) => entry.text)).toEqual([
      "Boot",
      "Ready",
      "PreArm: GPS",
    ]);
  });

  it("reads playback-compatible entries up to a cursor", () => {
    expect(readPlaybackStatusText(statusText, 250).map((entry) => entry.text)).toEqual([
      "Boot",
      "Ready",
    ]);
  });

  it("unwraps scoped status_text payloads from Rust", async () => {
    const cb = vi.fn();

    listen.mockImplementation(async (_event, handler) => {
      (handler as any)({
        payload: {
          envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
          value: statusText,
        },
      });
      return () => {};
    });

    await subscribeStatusText(cb);

    expect(cb.mock.calls.map(([entry]) => entry.text)).toEqual(["Boot", "Ready", "PreArm: GPS"]);
  });

  it("resets delivery when the session envelope changes", async () => {
    const cb = vi.fn();
    let handlerRef: ((event: { payload: unknown }) => void) | null = null;

    listen.mockImplementation(async (_event, handler) => {
      handlerRef = handler;
      return () => {};
    });

    await subscribeStatusText(cb);

    const handler: ((event: { payload: unknown }) => void) | null = handlerRef;
    if (handler) {
      (handler as any)({
        payload: {
          envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
          value: {
            available: true,
            complete: true,
            provenance: "stream",
            value: { entries: [{ text: "First", severity: "info", timestamp_usec: 1 }] },
          },
        },
      });
      (handler as any)({
        payload: {
          envelope: { session_id: "session-2", source_kind: "live", seek_epoch: 0, reset_revision: 1 },
          value: {
            available: true,
            complete: true,
            provenance: "stream",
            value: { entries: [{ text: "Second", severity: "info", timestamp_usec: 2 }] },
          },
        },
      });
    }

    expect(cb.mock.calls.map(([entry]) => entry.text)).toEqual(["First", "Second"]);
  });

  it("continues incremental delivery after the rolling cap rotates", async () => {
    const cb = vi.fn();
    let handlerRef: ((event: { payload: unknown }) => void) | null = null;

    listen.mockImplementation(async (_event, handler) => {
      handlerRef = handler;
      return () => {};
    });

    await subscribeStatusText(cb);

    const handler: ((event: { payload: unknown }) => void) | null = handlerRef;
    if (!handler) throw new Error("missing status-text handler");

    (handler as any)({
      payload: {
        envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
        value: {
          available: true,
          complete: true,
          provenance: "stream",
          value: {
            entries: Array.from({ length: 100 }, (_, index) => ({
              sequence: index + 1,
              text: `Msg ${index + 1}`,
              severity: "info",
              timestamp_usec: index + 1,
            })),
          },
        },
      },
    });
    cb.mockClear();

    (handler as any)({
      payload: {
        envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
        value: {
          available: true,
          complete: true,
          provenance: "stream",
          value: {
            entries: Array.from({ length: 100 }, (_, index) => ({
              sequence: index + 2,
              text: `Msg ${index + 2}`,
              severity: "info",
              timestamp_usec: index + 2,
            })),
          },
        },
      },
    });

    expect(cb.mock.calls.map(([entry]) => entry.text)).toEqual(["Msg 101"]);
  });
});
