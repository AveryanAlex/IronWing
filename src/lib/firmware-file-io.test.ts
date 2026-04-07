// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  createFirmwareFileIo,
  type FirmwareFileIoDependencies,
} from "./firmware-file-io";

function createIo(overrides: Partial<FirmwareFileIoDependencies> = {}) {
  const openBinaryFile = vi.fn<NonNullable<FirmwareFileIoDependencies["openBinaryFile"]>>();

  return {
    openBinaryFile,
    io: createFirmwareFileIo({
      openBinaryFile,
      ...overrides,
    }),
  };
}

describe("createFirmwareFileIo", () => {
  it("returns cancelled when the browser picker is dismissed", async () => {
    const { io, openBinaryFile } = createIo();
    openBinaryFile.mockResolvedValueOnce(null);

    await expect(io.pickApjFile()).resolves.toEqual({ status: "cancelled" });
  });

  it("loads APJ bytes through the browser-safe binary seam", async () => {
    const { io, openBinaryFile } = createIo();
    openBinaryFile.mockResolvedValueOnce({
      name: "cubeorange.apj",
      bytes: Uint8Array.from([1, 2, 3, 4]),
    });

    const result = await io.pickApjFile();

    expect(result).toMatchObject({
      status: "success",
      selection: {
        kind: "local_apj_bytes",
        fileName: "cubeorange.apj",
        byteLength: 4,
        data: [1, 2, 3, 4],
      },
    });

    if (result.status !== "success") {
      throw new Error("expected a successful APJ selection");
    }

    expect(result.selection.digest).toMatch(/^[0-9a-f]{16}$/);
  });

  it("rejects unsupported extensions before they reach the firmware store", async () => {
    const { io, openBinaryFile } = createIo();
    openBinaryFile.mockResolvedValueOnce({
      name: "not-a-firmware.bin",
      bytes: Uint8Array.from([1, 2, 3]),
    });

    await expect(io.pickApjFile()).rejects.toThrow(/only \.apj firmware files/i);
  });

  it("rejects zero-byte BIN selections instead of producing unusable recovery sources", async () => {
    const { io, openBinaryFile } = createIo();
    openBinaryFile.mockResolvedValueOnce({
      name: "blank.bin",
      bytes: new Uint8Array([]),
    });

    await expect(io.pickBinFile()).rejects.toThrow(/selected \.bin firmware file was empty/i);
  });

  it("produces distinct digests for same-sized APJ replacements so retry context can refresh safely", async () => {
    const { io, openBinaryFile } = createIo();
    openBinaryFile
      .mockResolvedValueOnce({
        name: "first.apj",
        bytes: Uint8Array.from([1, 2, 3]),
      })
      .mockResolvedValueOnce({
        name: "second.apj",
        bytes: Uint8Array.from([3, 2, 1]),
      });

    const first = await io.pickApjFile();
    const second = await io.pickApjFile();

    if (first.status !== "success" || second.status !== "success") {
      throw new Error("expected successful APJ selections");
    }

    expect(first.selection.byteLength).toBe(second.selection.byteLength);
    expect(first.selection.digest).not.toBe(second.selection.digest);
  });
});
