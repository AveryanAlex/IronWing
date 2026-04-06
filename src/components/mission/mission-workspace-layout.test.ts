import { describe, expect, it } from "vitest";

import { resolveMissionWorkspaceLayout } from "./mission-workspace-layout";

describe("resolveMissionWorkspaceLayout", () => {
  it("keeps comfortable wide layouts split with sidebar support placement", () => {
    const layout = resolveMissionWorkspaceLayout(
      {
        width: 1440,
        height: 900,
        tier: "wide",
      },
      "mission",
    );

    expect(layout).toMatchObject({
      mode: "wide",
      tier: "wide",
      width: 1440,
      height: 900,
      tierMismatch: false,
      detailColumns: "split",
      supportPlacement: "sidebar",
      showPhoneSegments: false,
      phoneSegmentDefault: null,
    });
  });

  it("compacts a wide-but-short shell from real dimensions instead of trusting tier alone", () => {
    const layout = resolveMissionWorkspaceLayout(
      {
        width: 1280,
        height: 720,
        tier: "wide",
      },
      "mission",
    );

    expect(layout).toMatchObject({
      mode: "compact-wide",
      tier: "wide",
      width: 1280,
      height: 720,
      tierMismatch: false,
      detailColumns: "stacked",
      supportPlacement: "below",
      showPhoneSegments: false,
      phoneSegmentDefault: null,
    });
  });

  it("uses a mission-only segmented shell on phone while keeping other planner modes stacked", () => {
    const missionLayout = resolveMissionWorkspaceLayout(
      {
        width: 390,
        height: 844,
        tier: "phone",
      },
      "mission",
    );
    const fenceLayout = resolveMissionWorkspaceLayout(
      {
        width: 390,
        height: 844,
        tier: "phone",
      },
      "fence",
    );

    expect(missionLayout).toMatchObject({
      mode: "phone-segmented",
      tier: "phone",
      detailColumns: "stacked",
      supportPlacement: "below",
      showPhoneSegments: true,
      phoneSegmentDefault: "plan",
    });
    expect(fenceLayout).toMatchObject({
      mode: "phone-stack",
      tier: "phone",
      detailColumns: "stacked",
      supportPlacement: "below",
      showPhoneSegments: false,
      phoneSegmentDefault: null,
    });
  });

  it("fails closed to the desktop-safe fallback when dimensions are malformed", () => {
    const layout = resolveMissionWorkspaceLayout(
      {
        width: Number.NaN,
        height: -12,
        tier: "bogus",
      },
      "mission",
    );

    expect(layout).toMatchObject({
      mode: "wide",
      tier: "wide",
      width: 1440,
      height: 900,
      detailColumns: "split",
      supportPlacement: "sidebar",
      showPhoneSegments: false,
      phoneSegmentDefault: null,
    });
    expect(layout.tierMismatch).toBe(false);
  });

  it("surfaces tier mismatches when the reported tier disagrees with the viewport", () => {
    const layout = resolveMissionWorkspaceLayout(
      {
        width: 390,
        height: 844,
        tier: "wide",
      },
      "mission",
    );

    expect(layout).toMatchObject({
      mode: "phone-segmented",
      tier: "phone",
      width: 390,
      height: 844,
      tierMismatch: true,
      showPhoneSegments: true,
      phoneSegmentDefault: "plan",
    });
  });
});
