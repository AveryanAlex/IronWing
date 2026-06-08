import { describe, expect, it } from "vitest";

import { EVENT_NAMES } from "../../lib/generated/events";
import { emitWebEvent, listen } from "./event";

describe("web platform event bridge", () => {
  it("delivers payloads and supports unlisten", async () => {
    const received: number[] = [];
    const first = { phase_label: "programming", bytes_written: 1, bytes_total: 2, pct: 50 };
    const second = { phase_label: "programming", bytes_written: 2, bytes_total: 2, pct: 100 };
    const unlisten = await listen(EVENT_NAMES.FIRMWARE_PROGRESS, (event) => {
      received.push(event.payload.bytes_written);
    });

    emitWebEvent(EVENT_NAMES.FIRMWARE_PROGRESS, first);
    unlisten();
    emitWebEvent(EVENT_NAMES.FIRMWARE_PROGRESS, second);

    expect(received).toEqual([1]);
  });
});
