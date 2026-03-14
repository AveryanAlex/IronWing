import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { resolve, relative, join } from "path";

/**
 * Source guardrail: prevent direct @tauri-apps/api/core and @tauri-apps/api/event
 * imports outside the approved platform boundary modules.
 *
 * Only the Tauri platform implementation files may import these directly.
 * All other frontend code must use the @platform/core and @platform/event aliases,
 * which switch at build time between tauri/ and mock/ implementations.
 */

const SRC_DIR = resolve(__dirname, "..");

const CORE_ALLOWLIST = new Set(["src/platform/tauri/core.ts"]);
const EVENT_ALLOWLIST = new Set(["src/platform/tauri/event.ts"]);

const CORE_IMPORT_RE = /['"]@tauri-apps\/api\/core['"]/;
const EVENT_IMPORT_RE = /['"]@tauri-apps\/api\/event['"]/;

function walkTs(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTs(full));
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)
    ) {
      results.push(full);
    }
  }
  return results;
}

function scanSourceFiles(
  pattern: RegExp,
  allowlist: Set<string>,
): string[] {
  const files = walkTs(SRC_DIR);
  const violations: string[] = [];

  for (const file of files) {
    const rel = relative(SRC_DIR, file).replace(/\\/g, "/");
    const srcRel = `src/${rel}`;
    if (allowlist.has(srcRel)) continue;

    const content = readFileSync(file, "utf-8");
    if (pattern.test(content)) {
      violations.push(srcRel);
    }
  }

  return violations.sort();
}

describe("platform import boundary", () => {
  it("no files outside the allowlist import @tauri-apps/api/core", () => {
    const violations = scanSourceFiles(CORE_IMPORT_RE, CORE_ALLOWLIST);
    expect(
      violations,
      `Unexpected direct @tauri-apps/api/core imports in:\n  ${violations.join("\n  ")}\n\nUse @platform/core instead. Only ${[...CORE_ALLOWLIST].join(", ")} may import directly.`,
    ).toEqual([]);
  });

  it("no files outside the allowlist import @tauri-apps/api/event", () => {
    const violations = scanSourceFiles(EVENT_IMPORT_RE, EVENT_ALLOWLIST);
    expect(
      violations,
      `Unexpected direct @tauri-apps/api/event imports in:\n  ${violations.join("\n  ")}\n\nUse @platform/event instead. Only ${[...EVENT_ALLOWLIST].join(", ")} may import directly.`,
    ).toEqual([]);
  });
});
