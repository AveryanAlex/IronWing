import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, relative, resolve } from "path";

type ImportRule = {
  label: string;
  predicate: (specifier: string) => boolean;
  allowlist?: Set<string>;
  guidance: string;
};

const SRC_DIR = resolve(__dirname, "..");
const PLATFORM_DIR_PREFIX = "src/platform/";

const IMPORT_SPECIFIER_PATTERNS = [
  /\bimport\s+(?:type\s+)?(?:[^'"`]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bexport\s+(?:type\s+)?(?:[^'"`]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const SOURCE_FILE_RE = /(?:\.svelte(?:\.(?:ts|js))?|\.(?:ts|tsx))$/;
const TEST_FILE_RE = /\.(?:test|spec)\.(?:svelte(?:\.(?:ts|js))?|ts|tsx)$/;

const DIRECT_TAURI_IMPORT_RULES: ImportRule[] = [
  {
    label: "@tauri-apps/api/core",
    predicate: (specifier) => specifier === "@tauri-apps/api/core",
    allowlist: new Set(["src/platform/tauri/core.ts"]),
    guidance: "Use @platform/core instead.",
  },
  {
    label: "@tauri-apps/api/event",
    predicate: (specifier) => specifier === "@tauri-apps/api/event",
    allowlist: new Set(["src/platform/tauri/event.ts"]),
    guidance: "Use @platform/event instead.",
  },
  {
    label: "@tauri-apps/plugin-http",
    predicate: (specifier) => specifier === "@tauri-apps/plugin-http",
    allowlist: new Set(["src/platform/tauri/http.ts"]),
    guidance: "Use @platform/http instead.",
  },
];

const ACTIVE_SOURCE_IMPORT_RULES: ImportRule[] = [
  {
    label: "src-old runtime imports",
    predicate: (specifier) => /(^|\/)src-old(?:\/|$)/.test(specifier),
    guidance: "Do not reach into src-old/. Keep the active runtime independent from the quarantined React tree.",
  },
  {
    label: "direct platform implementation imports",
    predicate: (specifier) => /(?:^|\/)platform\/(?:mock|tauri)(?:\/|$)/.test(specifier),
    guidance: "Use the @platform/core, @platform/event, and @platform/http aliases instead of importing platform implementations directly.",
  },
];

function walkSourceFiles(dir: string): string[] {
  const results: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;

    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkSourceFiles(full));
      continue;
    }

    if (!SOURCE_FILE_RE.test(entry.name)) continue;
    if (entry.name.endsWith(".d.ts")) continue;
    if (TEST_FILE_RE.test(entry.name)) continue;

    results.push(full);
  }

  return results;
}

function normalizeSourcePath(file: string) {
  return `src/${relative(SRC_DIR, file).replace(/\\/g, "/")}`;
}

function extractImportSpecifiers(content: string) {
  const specifiers = new Set<string>();

  for (const pattern of IMPORT_SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(content)) !== null) {
      specifiers.add(match[1]);
    }
  }

  return [...specifiers];
}

function scanFiles(rule: ImportRule, options?: { skipPlatformFiles?: boolean }): string[] {
  const violations: string[] = [];

  for (const file of walkSourceFiles(SRC_DIR)) {
    const srcRel = normalizeSourcePath(file);
    if (rule.allowlist?.has(srcRel)) continue;
    if (options?.skipPlatformFiles && srcRel.startsWith(PLATFORM_DIR_PREFIX)) continue;

    const content = readFileSync(file, "utf-8");
    const matches = extractImportSpecifiers(content).filter(rule.predicate);
    if (matches.length > 0) {
      violations.push(`${srcRel} -> ${matches.join(", ")}`);
    }
  }

  return violations.sort();
}

describe("platform import boundary", () => {
  for (const rule of DIRECT_TAURI_IMPORT_RULES) {
    it(`no files outside the allowlist import ${rule.label}`, () => {
      const violations = scanFiles(rule);
      expect(
        violations,
        `Unexpected direct ${rule.label} imports in:\n  ${violations.join("\n  ")}\n\n${rule.guidance} Only ${[...(rule.allowlist ?? [])].join(", ")} may import ${rule.label} directly.`,
      ).toEqual([]);
    });
  }

  for (const rule of ACTIVE_SOURCE_IMPORT_RULES) {
    it(`active src files do not use ${rule.label}`, () => {
      const violations = scanFiles(rule, { skipPlatformFiles: true });
      expect(
        violations,
        `Unexpected ${rule.label} in active src files:\n  ${violations.join("\n  ")}\n\n${rule.guidance}`,
      ).toEqual([]);
    });
  }
});
