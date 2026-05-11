// @vitest-environment jsdom

import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import LogsRecordingPanel from "./LogsRecordingPanel.svelte";

describe("LogsRecordingPanel", () => {
  it("marks long path and file values as wrap-safe content", () => {
    render(LogsRecordingPanel, {
      props: {
        recordingStatus: {
          kind: "recording",
          operation_id: "recording_start",
          mode: "manual",
          file_name: "capture-with-a-very-long-file-name-that-should-wrap.tlog",
          destination_path: "/very/long/path/that/should/wrap/instead/of/overflowing/into/the/next/card/capture-with-a-very-long-file-name-that-should-wrap.tlog",
          bytes_written: 1024,
          started_at_unix_msec: 123,
        },
        recordingError: null,
        manualRecordingError: null,
        recordingPath: "/fallback/path/that/should/also/wrap/manual-capture.tlog",
        recordingLabel: "Recording capture-with-a-very-long-file-name-that-should-wrap.tlog",
        supportsRecordingPicker: true,
        recordingAndReplayOverlap: false,
        autoRecordEnabled: true,
        autoRecordDirectory: "/auto/record/path/that/should/wrap",
        settingsLoading: false,
        hasSettings: true,
        onToggleRecording: vi.fn(),
        onRecordingPathChange: vi.fn(),
        onToggleAutoRecord: vi.fn(),
      },
    });

    expect(screen.getByTestId("logs-recording-status-copy").className).toContain("logs-content-wrap");
    expect(screen.getByTestId("logs-recording-destination-value").className).toContain("logs-content-wrap");
    expect(screen.getByTestId("logs-recording-file-value").className).toContain("logs-content-wrap");
    expect(screen.getByTestId("logs-recording-path-help").className).toContain("logs-content-wrap");
    expect(screen.getByTestId("logs-auto-record-help").className).toContain("logs-content-wrap");
  });
});
