import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cancelMissionTransferMock,
  clearFenceMock,
  clearMissionMock,
  clearRallyMock,
  downloadFenceMock,
  downloadMissionMock,
  downloadRallyMock,
  formatUnknownErrorMock,
  subscribeMissionProgressMock,
  subscribeMissionStateMock,
  uploadFenceMock,
  uploadMissionMock,
  uploadRallyMock,
  validateMissionMock,
} = vi.hoisted(() => ({
  cancelMissionTransferMock: vi.fn(),
  clearFenceMock: vi.fn(),
  clearMissionMock: vi.fn(),
  clearRallyMock: vi.fn(),
  downloadFenceMock: vi.fn(),
  downloadMissionMock: vi.fn(),
  downloadRallyMock: vi.fn(),
  formatUnknownErrorMock: vi.fn((error: unknown) => String(error)),
  subscribeMissionProgressMock: vi.fn(),
  subscribeMissionStateMock: vi.fn(),
  uploadFenceMock: vi.fn(),
  uploadMissionMock: vi.fn(),
  uploadRallyMock: vi.fn(),
  validateMissionMock: vi.fn(),
}));

vi.mock("../../mission", () => ({
  cancelMissionTransfer: cancelMissionTransferMock,
  clearMission: clearMissionMock,
  downloadMission: downloadMissionMock,
  subscribeMissionProgress: subscribeMissionProgressMock,
  subscribeMissionState: subscribeMissionStateMock,
  uploadMission: uploadMissionMock,
  validateMission: validateMissionMock,
}));

vi.mock("../../fence", () => ({
  clearFence: clearFenceMock,
  downloadFence: downloadFenceMock,
  uploadFence: uploadFenceMock,
}));

vi.mock("../../rally", () => ({
  clearRally: clearRallyMock,
  downloadRally: downloadRallyMock,
  uploadRally: uploadRallyMock,
}));

vi.mock("../error-format", () => ({
  formatUnknownError: formatUnknownErrorMock,
}));

import { downloadWorkspace } from "./mission-planner";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

describe("downloadWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("downloads mission, fence, and rally sequentially for real vehicle transfers", async () => {
    const mission = deferred<{ plan: { items: [] }; home: null }>();
    const fence = deferred<{ regions: []; return_point: null }>();
    const rally = deferred<{ points: [] }>();

    downloadMissionMock.mockReturnValueOnce(mission.promise);
    downloadFenceMock.mockReturnValueOnce(fence.promise);
    downloadRallyMock.mockReturnValueOnce(rally.promise);

    const pending = downloadWorkspace();

    expect(downloadMissionMock).toHaveBeenCalledTimes(1);
    expect(downloadFenceMock).not.toHaveBeenCalled();
    expect(downloadRallyMock).not.toHaveBeenCalled();

    mission.resolve({
      plan: { items: [] },
      home: null,
    });

    await vi.waitFor(() => expect(downloadFenceMock).toHaveBeenCalledTimes(1));
    expect(downloadRallyMock).not.toHaveBeenCalled();

    fence.resolve({
      regions: [],
      return_point: null,
    });

    await vi.waitFor(() => expect(downloadRallyMock).toHaveBeenCalledTimes(1));

    rally.resolve({
      points: [],
    });

    await expect(pending).resolves.toEqual({
      mission: { items: [] },
      home: null,
      fence: {
        regions: [],
        return_point: null,
      },
      rally: { points: [] },
    });
  });
});
