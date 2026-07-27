import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({
  dismiss: vi.fn(),
  error: vi.fn(() => "error-id"),
  info: vi.fn(() => "info-id"),
  success: vi.fn(() => "success-id"),
  warning: vi.fn(() => "warning-id"),
}));

vi.mock("svelte-sonner", () => ({ toast }));

import {
  dismissNotification,
  notifyError,
  notifyInfo,
  notifySuccess,
  notifyUnknownError,
  notifyWarning,
} from "./notifications";

describe("notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies standard durations while preserving caller overrides", () => {
    notifySuccess("Saved");
    notifyInfo("Connected");
    notifyWarning("Review required");
    notifyError("Failed", { duration: 12_000, id: "operation" });

    expect(toast.success).toHaveBeenCalledWith("Saved", { duration: 4_000 });
    expect(toast.info).toHaveBeenCalledWith("Connected", { duration: 6_000 });
    expect(toast.warning).toHaveBeenCalledWith("Review required", { duration: 8_000 });
    expect(toast.error).toHaveBeenCalledWith("Failed", {
      duration: 12_000,
      id: "operation",
    });
  });

  it("formats unknown failures and dismisses by id", () => {
    notifyUnknownError("Import failed", new Error("bad file"), {
      id: "import",
    });
    dismissNotification("import");

    expect(toast.error).toHaveBeenCalledWith("Import failed", {
      description: "bad file",
      duration: 10_000,
      id: "import",
    });
    expect(toast.dismiss).toHaveBeenCalledWith("import");
  });
});
