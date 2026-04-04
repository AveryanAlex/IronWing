import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_DIR = resolve(__dirname, "..");
const RUNES_OPT_OUT_RE = /<svelte:options\s+runes=\{false\}\s*\/>/;
const PRODUCT_SVELTE_RE = /\.svelte$/;

function walkSvelteFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  const results: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "test") {
      continue;
    }

    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkSvelteFiles(absolute));
      continue;
    }

    if (PRODUCT_SVELTE_RE.test(entry.name)) {
      results.push(absolute);
    }
  }

  return results;
}

describe("active Svelte runes guardrail", () => {
  it("keeps shipped src/ components on default runes mode", () => {
    const offenders = walkSvelteFiles(SRC_DIR)
      .filter((file) => RUNES_OPT_OUT_RE.test(readFileSync(file, "utf8")))
      .map((file) => relative(resolve(SRC_DIR, ".."), file).replace(/\\/g, "/"));

    expect(offenders).toEqual([]);
  });
});
