// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LogLibraryEntry, RawMessagePage, RawMessageQuery } from "../../logs";
import type { LogsExportState, LogsRawBrowserState } from "../../lib/stores/logs-workspace";
import LogsRawMessagesPanel from "./LogsRawMessagesPanel.svelte";

function createEntry(): LogLibraryEntry {
  return {
    entry_id: "ready",
    status: "ready",
    imported_at_unix_msec: 1778246400000,
    source: {
      original_path: "/logs/ready.tlog",
      fingerprint: { size_bytes: 1024, modified_unix_msec: 1778246300000 },
      status: { kind: "available", current_fingerprint: { size_bytes: 1024, modified_unix_msec: 1778246300000 } },
    },
    metadata: {
      display_name: "ready.tlog",
      format: "tlog",
      start_usec: 1_000_000,
      end_usec: 61_000_000,
      duration_secs: 60,
      total_messages: 2400,
      message_types: { HEARTBEAT: 60, ATTITUDE: 120 },
      vehicle_type: "quadrotor",
      autopilot: "ardupilotmega",
    },
    diagnostics: [],
    index: {
      index_id: "idx-ready",
      relative_path: "logs/indexes/ready.json",
      format: "tlog",
      index_version: 1,
      built_at_unix_msec: 1778246410000,
      message_count: 2399,
      covers_start_usec: 1_000_000,
      covers_end_usec: 61_000_000,
    },
  };
}

function createRawBrowserState(overrides: Partial<LogsRawBrowserState> = {}): LogsRawBrowserState {
  const page: RawMessagePage = {
    entry_id: "ready",
    items: [
      {
        sequence: 1,
        timestamp_usec: 1_500_000,
        message_type: "HEARTBEAT",
        system_id: 1,
        component_id: 1,
        raw_len_bytes: 17,
        fields: { base_mode: 81, custom_mode: 4 },
        detail: { kind: "heartbeat", mavlink_version: 3 },
        hex_payload: "fe090001010000",
        diagnostics: [],
      },
      {
        sequence: 2,
        timestamp_usec: 2_500_000,
        message_type: "ATTITUDE",
        system_id: 1,
        component_id: 1,
        raw_len_bytes: 28,
        fields: { roll: 0.1, pitch: 0.2, yaw: 0.3 },
        detail: { kind: "attitude", source: "parsed" },
        hex_payload: "fd0c0001010203",
        diagnostics: [],
      },
    ],
    next_cursor: "cursor-2",
    total_available: 12,
  };

  return {
    phase: "ready",
    error: null,
    request: {
      entry_id: "ready",
      cursor: null,
      start_usec: 1_000_000,
      end_usec: 4_000_000,
      message_types: ["HEARTBEAT"],
      text: "armed",
      field_filters: [{ field: "base_mode", value_text: "81" }],
      limit: 25,
      include_detail: true,
      include_hex: true,
    },
    page,
    filters: {
      startUsecInput: "1000000",
      endUsecInput: "4000000",
      messageTypesInput: "HEARTBEAT",
      textInput: "armed",
      fieldFilters: [{ field: "base_mode", value_text: "81" }],
      limit: 25,
      includeDetail: true,
      includeHex: true,
    },
    selectedSequence: null,
    savedFiltersByEntryId: {},
    savedSelectionByEntryId: {},
    ...overrides,
  };
}

function createExportState(overrides: Partial<LogsExportState> = {}): LogsExportState {
  return {
    origin: null,
    phase: "idle",
    error: null,
    request: null,
    progress: null,
    result: null,
    ...overrides,
  } satisfies LogsExportState;
}

afterEach(() => {
  cleanup();
});

describe("LogsRawMessagesPanel RawMessages", () => {
  it("queries, paginates, selects details, and exports the active filtered view", async () => {
    const onFiltersChange = vi.fn();
    const onRunQuery = vi.fn<(request: Omit<RawMessageQuery, "entry_id"> & { entry_id?: string }) => void>();
    const onExport = vi.fn();
    const onSelectSequence = vi.fn();

    render(LogsRawMessagesPanel, {
      props: {
        entry: createEntry(),
        rawBrowser: createRawBrowserState(),
        exportState: createExportState(),
        onFiltersChange,
        onRunQuery,
        onExport,
        onSelectSequence,
      },
    });

    expect(screen.getByTestId("logs-raw-messages-table")).toBeTruthy();
    expect(screen.getByLabelText("Field name 1")).toBeTruthy();
    expect(screen.getByLabelText("Field value 1")).toBeTruthy();
    expect(screen.getByLabelText("Export destination path")).toBeTruthy();

    await fireEvent.input(screen.getByTestId("logs-raw-type-filter"), {
      target: { value: "HEARTBEAT, ATTITUDE" },
    });
    await fireEvent.input(screen.getByTestId("logs-raw-field-name-0"), {
      target: { value: "custom_mode" },
    });
    await fireEvent.input(screen.getByTestId("logs-raw-field-value-0"), {
      target: { value: "4" },
    });
    await fireEvent.click(screen.getByTestId("logs-raw-run-query"));

    expect(onRunQuery).toHaveBeenCalledWith(expect.objectContaining({
      cursor: null,
      message_types: ["HEARTBEAT", "ATTITUDE"],
      text: "armed",
      field_filters: [{ field: "custom_mode", value_text: "4" }],
      include_detail: true,
      include_hex: true,
      limit: 25,
    }));

    await fireEvent.click(screen.getByTestId("logs-raw-row-2"));
    expect(onSelectSequence).toHaveBeenCalledWith(2);

    await fireEvent.click(screen.getByTestId("logs-raw-next-page"));
    expect(onRunQuery).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "cursor-2" }));

    await fireEvent.input(screen.getByTestId("logs-raw-export-destination"), {
      target: { value: "/tmp/raw.csv" },
    });
    await fireEvent.click(screen.getByTestId("logs-raw-export"));

    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({
      destination_path: "/tmp/raw.csv",
      format: "csv",
      message_types: ["HEARTBEAT", "ATTITUDE"],
      text: "armed",
      field_filters: [{ field: "custom_mode", value_text: "4" }],
    }));
  });

  it("supports keyboard selection and announces raw-browser failures", async () => {
    const onSelectSequence = vi.fn();

    render(LogsRawMessagesPanel, {
      props: {
        entry: createEntry(),
        rawBrowser: createRawBrowserState({
          error: "failed to refresh the raw-message page",
        }),
        exportState: createExportState(),
        onFiltersChange: vi.fn(),
        onRunQuery: vi.fn(),
        onExport: vi.fn(),
        onSelectSequence,
      },
    });

    expect(screen.getByRole("alert").textContent).toContain("failed to refresh the raw-message page");

    await fireEvent.keyDown(screen.getByTestId("logs-raw-row-2"), { key: "Enter" });
    expect(onSelectSequence).toHaveBeenCalledWith(2);
  });

  it("keeps enough cursor history to return from page 2 to page 1", async () => {
    const onRunQuery = vi.fn<(request: Omit<RawMessageQuery, "entry_id"> & { entry_id?: string }) => void>();

    render(LogsRawMessagesPanel, {
      props: {
        entry: createEntry(),
        rawBrowser: createRawBrowserState(),
        exportState: createExportState(),
        onFiltersChange: vi.fn(),
        onRunQuery,
        onExport: vi.fn(),
        onSelectSequence: vi.fn(),
      },
    });

    const previousButton = screen.getByTestId("logs-raw-previous-page") as HTMLButtonElement;
    expect(previousButton.disabled).toBe(true);

    await fireEvent.click(screen.getByTestId("logs-raw-next-page"));

    expect(previousButton.disabled).toBe(false);

    await fireEvent.click(previousButton);

    expect(onRunQuery).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: null }));
  });

  it("clears stale cursor history when the active raw filters change", async () => {
    const onRunQuery = vi.fn<(request: Omit<RawMessageQuery, "entry_id"> & { entry_id?: string }) => void>();

    const { rerender } = render(LogsRawMessagesPanel, {
      props: {
        entry: createEntry(),
        rawBrowser: createRawBrowserState(),
        exportState: createExportState(),
        onFiltersChange: vi.fn(),
        onRunQuery,
        onExport: vi.fn(),
        onSelectSequence: vi.fn(),
      },
    });

    const previousButton = screen.getByTestId("logs-raw-previous-page") as HTMLButtonElement;
    expect(previousButton.disabled).toBe(true);

    await fireEvent.click(screen.getByTestId("logs-raw-next-page"));
    expect(onRunQuery).toHaveBeenCalledTimes(1);
    expect(previousButton.disabled).toBe(false);

    await rerender({
      entry: createEntry(),
      rawBrowser: createRawBrowserState({
        filters: {
          startUsecInput: "1000000",
          endUsecInput: "4000000",
          messageTypesInput: "ATTITUDE",
          textInput: "armed",
          fieldFilters: [{ field: "base_mode", value_text: "81" }],
          limit: 25,
          includeDetail: true,
          includeHex: true,
        },
      }),
      exportState: createExportState(),
      onFiltersChange: vi.fn(),
      onRunQuery,
      onExport: vi.fn(),
      onSelectSequence: vi.fn(),
    });

    await waitFor(() => {
      expect((screen.getByTestId("logs-raw-previous-page") as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("preserves field-filter row identity when persisted filters sync back", async () => {
    const onFiltersChange = vi.fn();

    const { rerender } = render(LogsRawMessagesPanel, {
      props: {
        entry: createEntry(),
        rawBrowser: createRawBrowserState(),
        exportState: createExportState(),
        onFiltersChange,
        onRunQuery: vi.fn(),
        onExport: vi.fn(),
        onSelectSequence: vi.fn(),
      },
    });

    const nameInputBefore = screen.getByTestId("logs-raw-field-name-0");
    await fireEvent.input(nameInputBefore, { target: { value: "custom_mode" } });
    await fireEvent.input(screen.getByTestId("logs-raw-field-value-0"), { target: { value: "4" } });

    await rerender({
      entry: createEntry(),
      rawBrowser: createRawBrowserState({
        filters: {
          startUsecInput: "1000000",
          endUsecInput: "4000000",
          messageTypesInput: "HEARTBEAT",
          textInput: "armed",
          fieldFilters: [{ field: "custom_mode", value_text: "4" }],
          limit: 25,
          includeDetail: true,
          includeHex: true,
        },
      }),
      exportState: createExportState(),
      onFiltersChange,
      onRunQuery: vi.fn(),
      onExport: vi.fn(),
      onSelectSequence: vi.fn(),
    });

    expect(screen.getByTestId("logs-raw-field-name-0")).toBe(nameInputBefore);
  });

  it("shows inline numeric validation errors and blocks invalid query and export requests", async () => {
    const onRunQuery = vi.fn<(request: Omit<RawMessageQuery, "entry_id"> & { entry_id?: string }) => void>();
    const onExport = vi.fn();

    render(LogsRawMessagesPanel, {
      props: {
        entry: createEntry(),
        rawBrowser: createRawBrowserState(),
        exportState: createExportState(),
        onFiltersChange: vi.fn(),
        onRunQuery,
        onExport,
        onSelectSequence: vi.fn(),
      },
    });

    await fireEvent.input(screen.getByTestId("logs-raw-start-filter"), {
      target: { value: "-1" },
    });
    await fireEvent.input(screen.getByTestId("logs-raw-end-filter"), {
      target: { value: "1.5" },
    });
    await fireEvent.input(screen.getByTestId("logs-raw-limit-filter"), {
      target: { value: "0" },
    });
    await fireEvent.input(screen.getByTestId("logs-raw-export-destination"), {
      target: { value: "/tmp/raw.csv" },
    });

    expect(screen.getByText("Start μs must be a non-negative integer.")).toBeTruthy();
    expect(screen.getByText("End μs must be a non-negative integer.")).toBeTruthy();
    expect(screen.getByText("Page size must be a positive integer from 1 to 500.")).toBeTruthy();

    await fireEvent.click(screen.getByTestId("logs-raw-run-query"));
    await fireEvent.click(screen.getByTestId("logs-raw-export"));

    expect(onRunQuery).not.toHaveBeenCalled();
    expect(onExport).not.toHaveBeenCalled();
  });

  it("rejects page sizes above the backend max and keeps them out of IPC requests", async () => {
    const onRunQuery = vi.fn<(request: Omit<RawMessageQuery, "entry_id"> & { entry_id?: string }) => void>();
    const onExport = vi.fn();

    render(LogsRawMessagesPanel, {
      props: {
        entry: createEntry(),
        rawBrowser: createRawBrowserState(),
        exportState: createExportState(),
        onFiltersChange: vi.fn(),
        onRunQuery,
        onExport,
        onSelectSequence: vi.fn(),
      },
    });

    await fireEvent.input(screen.getByTestId("logs-raw-limit-filter"), {
      target: { value: "501" },
    });
    await fireEvent.input(screen.getByTestId("logs-raw-export-destination"), {
      target: { value: "/tmp/raw.csv" },
    });

    expect(screen.getByText("Page size must be a positive integer from 1 to 500.")).toBeTruthy();

    await fireEvent.click(screen.getByTestId("logs-raw-run-query"));
    await fireEvent.click(screen.getByTestId("logs-raw-export"));

    expect(onRunQuery).not.toHaveBeenCalled();
    expect(onExport).not.toHaveBeenCalled();
  });

  it("rejects alternate numeric page sizes and keeps them out of IPC requests", async () => {
    const onRunQuery = vi.fn<(request: Omit<RawMessageQuery, "entry_id"> & { entry_id?: string }) => void>();
    const onExport = vi.fn();

    render(LogsRawMessagesPanel, {
      props: {
        entry: createEntry(),
        rawBrowser: createRawBrowserState(),
        exportState: createExportState(),
        onFiltersChange: vi.fn(),
        onRunQuery,
        onExport,
        onSelectSequence: vi.fn(),
      },
    });

    for (const invalidValue of ["1.0", "1e3", "01"]) {
      await fireEvent.input(screen.getByTestId("logs-raw-limit-filter"), {
        target: { value: invalidValue },
      });
      await fireEvent.input(screen.getByTestId("logs-raw-export-destination"), {
        target: { value: "/tmp/raw.csv" },
      });

      expect(screen.getByText("Page size must be a positive integer from 1 to 500.")).toBeTruthy();

      await fireEvent.click(screen.getByTestId("logs-raw-run-query"));
      await fireEvent.click(screen.getByTestId("logs-raw-export"));

      expect(onRunQuery).not.toHaveBeenCalled();
      expect(onExport).not.toHaveBeenCalled();
    }
  });

  it("does not render chart export feedback inside the raw messages panel", () => {
    render(LogsRawMessagesPanel, {
      props: {
        entry: createEntry(),
        rawBrowser: createRawBrowserState(),
        exportState: createExportState({
          origin: "chart",
          phase: "completed",
          result: {
            operation_id: "log_export",
            destination_path: "/tmp/range.csv",
            bytes_written: 64,
            rows_written: 4,
            diagnostics: [],
          },
        }),
        onFiltersChange: vi.fn(),
        onRunQuery: vi.fn(),
        onExport: vi.fn(),
        onSelectSequence: vi.fn(),
      },
    });

    expect(screen.queryByText(/Export completed/i)).toBeNull();
    expect(screen.getByTestId("logs-raw-export").textContent).toContain("Export filtered CSV");
  });
});
