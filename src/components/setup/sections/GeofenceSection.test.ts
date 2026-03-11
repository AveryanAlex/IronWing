import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";

const SECTION_SRC = readFileSync(resolve(__dirname, "GeofenceSection.tsx"), "utf-8");

describe("GeofenceSection docs URL", () => {
  it("geofence docs URL resolves to the correct ArduPilot page", () => {
    const url = resolveDocsUrl("geofence");
    expect(url).toBe(
      "https://ardupilot.org/copter/docs/common-geofencing-landing-page.html",
    );
  });
});

describe("GeofenceSection structural — shared primitives", () => {
  it("imports SetupSectionIntro from shared", () => {
    expect(SECTION_SRC).toMatch(/import.*SetupSectionIntro.*from.*shared\/SetupSectionIntro/);
  });

  it("imports SectionCardHeader from shared", () => {
    expect(SECTION_SRC).toMatch(/import.*SectionCardHeader.*from.*shared\/SectionCardHeader/);
  });

  it("uses SetupSectionIntro component", () => {
    expect(SECTION_SRC).toContain("<SetupSectionIntro");
  });

  it("uses SectionCardHeader for card headers", () => {
    expect(SECTION_SRC).toContain("<SectionCardHeader");
  });

  it("resolves geofence docs via the docs registry", () => {
    expect(SECTION_SRC).toContain('resolveDocsUrl("geofence")');
  });
});

describe("GeofenceSection structural — validation", () => {
  it("validates ALT_MAX > ALT_MIN", () => {
    expect(SECTION_SRC).toMatch(/altMax.*<=.*altMin|altMax <= altMin/);
  });

  it("shows altitude warning when max <= min", () => {
    expect(SECTION_SRC).toContain("Max altitude must be greater than min altitude");
  });

  it("shows GPS lock warning when circle or polygon fence enabled", () => {
    expect(SECTION_SRC).toContain("requires GPS lock to arm");
  });

  it("shows disabled fence warning on breach action card", () => {
    expect(SECTION_SRC).toContain("Fence is disabled");
    expect(SECTION_SRC).toContain("breach action will not trigger");
  });
});

describe("GeofenceSection structural — layout", () => {
  it("root wrapper includes p-4 padding", () => {
    const rootDiv = SECTION_SRC.match(
      /return\s*\(\s*<div className="([^"]+)">/,
    );
    expect(rootDiv).not.toBeNull();
    expect(rootDiv![1]).toContain("p-4");
  });

  it("root wrapper uses flex column layout with gap", () => {
    const rootDiv = SECTION_SRC.match(
      /return\s*\(\s*<div className="([^"]+)">/,
    );
    expect(rootDiv).not.toBeNull();
    expect(rootDiv![1]).toContain("flex flex-col");
    expect(rootDiv![1]).toMatch(/gap-\d/);
  });

  it("has four card sections (Enable, Type, Parameters, Breach Action)", () => {
    const cardHeaders = SECTION_SRC.match(/<SectionCardHeader/g);
    expect(cardHeaders).not.toBeNull();
    expect(cardHeaders!.length).toBe(4);
  });

  it("fence parameters card is conditionally rendered when fence enabled", () => {
    expect(SECTION_SRC).toMatch(/fenceEnabled\s*&&/);
  });

  it("copter-only params are gated behind copter check", () => {
    expect(SECTION_SRC).toMatch(/copter\s*&&/);
    expect(SECTION_SRC).toContain("FENCE_ALT_MIN");
    expect(SECTION_SRC).toContain("FENCE_RADIUS");
  });
});
