import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(resolve(__dirname, "BottomNav.tsx"), "utf-8");

describe("BottomNav narrow-width overflow containment", () => {
  it("uses the nav element as a local horizontal scroll container", () => {
    const navTag = src.match(/<nav[\s\S]*?>/);
    expect(navTag).not.toBeNull();
    expect(navTag![0]).toContain("w-full");
    expect(navTag![0]).toContain("overflow-x-auto");
    expect(navTag![0]).toContain("overflow-y-hidden");
  });

  it("renders an inner flex strip with a minimum width larger than tiny viewports", () => {
    expect(src).toMatch(/className="flex min-w-\[360px\] items-center justify-around"/);
  });
});
