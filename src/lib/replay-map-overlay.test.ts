import { describe, expect, it } from "vitest";

import { buildReplayMarkerFlightPathQuery, createReplayPathOverlay } from "./replay-map-overlay";

describe("replay map overlay helpers", () => {
  it("uses a bounded nearby window without lossy point caps for marker-only handoff queries", () => {
    expect(buildReplayMarkerFlightPathQuery("entry-1", 2_000_000)).toEqual({
      entry_id: "entry-1",
      start_usec: 1_500_000,
      end_usec: 2_500_000,
      max_points: null,
    });
  });

  it("skips marker-only lookup when the replay cursor is unknown", () => {
    expect(buildReplayMarkerFlightPathQuery("entry-1", null)).toBeNull();
  });

  it("clears any stale replay marker when building a path-only overlay", () => {
    expect(createReplayPathOverlay("entry-1", "ready", [{
      timestamp_usec: 2_000_000,
      lat: 47.398142,
      lon: 8.546094,
      alt: 490,
      heading: 92,
    }], null)).toEqual({
      phase: "ready",
      entryId: "entry-1",
      path: [{
        timestamp_usec: 2_000_000,
        lat: 47.398142,
        lon: 8.546094,
        alt: 490,
        heading: 92,
      }],
      marker: null,
      error: null,
    });
  });
});
