import { existsSync, readFileSync, readdirSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import { describe, expect, it } from "vitest";

type ImportRule = {
  label: string;
  predicate: (specifier: string) => boolean;
  allowlist?: Set<string>;
  guidance: string;
};

type ActiveRuntimeEdge = {
  from: string;
  specifier: string;
  resolved: string | null;
  resolvedKind: "alias" | "package" | "source" | "missing";
};

type ActiveRuntimeRule = {
  label: string;
  matches: (edge: ActiveRuntimeEdge) => boolean;
  guidance: string;
};

const SRC_DIR = resolve(__dirname, "..");
const REPO_ROOT = resolve(SRC_DIR, "..");
const PLATFORM_DIR_PREFIX = "src/platform/";
const ACTIVE_RUNTIME_ROOTS = ["src/main.ts"] as const;
const ACTIVE_RUNTIME_TIMEOUT_MS = 5_000;
const ACTIVE_RUNTIME_RESOLVE_EXTENSIONS = ["", ".ts", ".tsx", ".svelte", ".js", ".jsx", ".mjs", ".cjs"] as const;

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

const ACTIVE_RUNTIME_RULES: ActiveRuntimeRule[] = [
  {
    label: "React package imports",
    matches: (edge) => /^(?:react|react-dom)(?:\/|$)/.test(edge.specifier),
    guidance:
      "The active runtime graph reachable from src/main.ts must stay on the shipped Svelte path. Replace React package usage with Svelte components, stores, or helpers.",
  },
  {
    label: "lucide-react package imports",
    matches: (edge) => /^(?:lucide-react)(?:\/|$)/.test(edge.specifier),
    guidance:
      "The active runtime graph must not reach React-era icon packages. Use Svelte-safe icons/assets or a neutral data module instead of lucide-react.",
  },
  {
    label: "React-era .tsx reach-through",
    matches: (edge) => edge.resolved?.endsWith(".tsx") ?? false,
    guidance:
      "Do not import .tsx modules anywhere in the active runtime graph. Keep the shipped Svelte path on .svelte/.ts modules or wrap the dependency behind a neutral boundary first.",
  },
  {
    label: "src/types.ts helper trap",
    matches: (edge) => edge.resolved === "src/types.ts" || /(?:^|\/)src\/types(?:\.ts)?$/.test(edge.specifier),
    guidance:
      "Do not route the active runtime through src/types.ts. Move shared non-React types into a neutral module or define a Svelte-local type instead.",
  },
  {
    label: "src-old runtime imports",
    matches: (edge) => /(^|\/)src-old(?:\/|$)/.test(edge.specifier) || (edge.resolved?.includes("src-old/") ?? false),
    guidance:
      "Do not reach into src-old/. Keep the active runtime independent from the quarantined React tree.",
  },
  {
    label: "direct platform implementation imports",
    matches: (edge) =>
      /(?:^|\/)platform\/(?:mock|tauri)(?:\/|$)/.test(edge.specifier) ||
      (edge.resolved?.startsWith("src/platform/mock/") ?? false) ||
      (edge.resolved?.startsWith("src/platform/tauri/") ?? false),
    guidance:
      "Use the @platform/core, @platform/event, and @platform/http aliases instead of importing platform implementations directly.",
  },
];

function normalizeProjectPath(file: string): string {
  return relative(REPO_ROOT, file).replace(/\\/g, "/");
}

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

function extractImportSpecifiers(content: string): string[] {
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
    const projectRel = normalizeProjectPath(file);
    if (rule.allowlist?.has(projectRel)) continue;
    if (options?.skipPlatformFiles && projectRel.startsWith(PLATFORM_DIR_PREFIX)) continue;

    const content = readFileSync(file, "utf-8");
    const matches = extractImportSpecifiers(content).filter(rule.predicate);
    if (matches.length > 0) {
      violations.push(`${projectRel} -> ${matches.join(", ")}`);
    }
  }

  return violations.sort();
}

function resolveActiveRuntimeImport(fromFile: string, specifier: string): ActiveRuntimeEdge {
  if (specifier.startsWith("@platform/")) {
    return {
      from: fromFile,
      specifier,
      resolved: specifier,
      resolvedKind: "alias",
    };
  }

  if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
    return {
      from: fromFile,
      specifier,
      resolved: specifier,
      resolvedKind: "package",
    };
  }

  const absoluteBase = resolve(dirname(resolve(REPO_ROOT, fromFile)), specifier);
  const candidates = [
    ...ACTIVE_RUNTIME_RESOLVE_EXTENSIONS.map((extension) => `${absoluteBase}${extension}`),
    ...ACTIVE_RUNTIME_RESOLVE_EXTENSIONS
      .filter((extension) => extension.length > 0)
      .map((extension) => join(absoluteBase, `index${extension}`)),
  ];

  const resolvedCandidate = candidates.find((candidate) => existsSync(candidate));
  if (!resolvedCandidate) {
    return {
      from: fromFile,
      specifier,
      resolved: null,
      resolvedKind: "missing",
    };
  }

  return {
    from: fromFile,
    specifier,
    resolved: normalizeProjectPath(resolvedCandidate),
    resolvedKind: "source",
  };
}

function buildActiveRuntimeGraph(rootFiles: readonly string[]): ActiveRuntimeEdge[] {
  const queue = [...rootFiles];
  const visited = new Set<string>();
  const edges: ActiveRuntimeEdge[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    const absolute = resolve(REPO_ROOT, current);
    const content = readFileSync(absolute, "utf-8");

    for (const specifier of extractImportSpecifiers(content)) {
      const edge = resolveActiveRuntimeImport(current, specifier);
      edges.push(edge);

      if (edge.resolvedKind === "source" && edge.resolved && !visited.has(edge.resolved)) {
        queue.push(edge.resolved);
      }
    }
  }

  return edges;
}

function formatActiveRuntimeEdge(edge: ActiveRuntimeEdge): string {
  if (edge.resolvedKind === "source") {
    return `${edge.from} imports ${JSON.stringify(edge.specifier)} -> ${edge.resolved}`;
  }

  if (edge.resolvedKind === "missing") {
    return `${edge.from} imports ${JSON.stringify(edge.specifier)} -> <unresolved>`;
  }

  return `${edge.from} imports ${JSON.stringify(edge.specifier)}`;
}

function findFirstActiveRuntimeViolation(
  edges: ActiveRuntimeEdge[],
  rule: ActiveRuntimeRule,
): ActiveRuntimeEdge | null {
  return edges.find((edge) => rule.matches(edge)) ?? null;
}

describe("platform import boundary", () => {
  for (const rule of DIRECT_TAURI_IMPORT_RULES) {
    it(`no files outside the allowlist import ${rule.label}`,
      {
        timeout: ACTIVE_RUNTIME_TIMEOUT_MS,
      },
      () => {
        const violations = scanFiles(rule);
        expect(
          violations,
          `Unexpected direct ${rule.label} imports in:\n  ${violations.join("\n  ")}\n\n${rule.guidance} Only ${[
            ...(rule.allowlist ?? []),
          ].join(", ")} may import ${rule.label} directly.`,
        ).toEqual([]);
      });
  }

  for (const rule of ACTIVE_RUNTIME_RULES) {
    it(
      `the active runtime graph does not use ${rule.label}`,
      {
        timeout: ACTIVE_RUNTIME_TIMEOUT_MS,
      },
      () => {
        const graph = buildActiveRuntimeGraph(ACTIVE_RUNTIME_ROOTS);
        const violation = findFirstActiveRuntimeViolation(graph, rule);

        expect(
          violation,
          violation
            ? `Active runtime violation: ${formatActiveRuntimeEdge(violation)}\n\n${rule.guidance}`
            : `Checked ${graph.length} active-runtime imports from ${ACTIVE_RUNTIME_ROOTS.join(", ")} with no ${rule.label} violations.`,
        ).toBeNull();
      },
    );
  }
});

describe("active runtime boundary helper rules", () => {
  const fixtureSource = "src/app/App.svelte";

  it.each([
    {
      label: "react package imports",
      edge: {
        from: fixtureSource,
        specifier: "react",
        resolved: "react",
        resolvedKind: "package",
      } satisfies ActiveRuntimeEdge,
      ruleLabel: "React package imports",
    },
    {
      label: "lucide-react package imports",
      edge: {
        from: fixtureSource,
        specifier: "lucide-react",
        resolved: "lucide-react",
        resolvedKind: "package",
      } satisfies ActiveRuntimeEdge,
      ruleLabel: "lucide-react package imports",
    },
    {
      label: ".tsx reach-through",
      edge: {
        from: fixtureSource,
        specifier: "../components/LegacyPanel",
        resolved: "src/components/LegacyPanel.tsx",
        resolvedKind: "source",
      } satisfies ActiveRuntimeEdge,
      ruleLabel: "React-era .tsx reach-through",
    },
    {
      label: "src/types helper trap",
      edge: {
        from: fixtureSource,
        specifier: "../types",
        resolved: "src/types.ts",
        resolvedKind: "source",
      } satisfies ActiveRuntimeEdge,
      ruleLabel: "src/types.ts helper trap",
    },
    {
      label: "src-old reach-through",
      edge: {
        from: fixtureSource,
        specifier: "../src-old/runtime/App",
        resolved: "src-old/runtime/App.tsx",
        resolvedKind: "source",
      } satisfies ActiveRuntimeEdge,
      ruleLabel: "src-old runtime imports",
    },
    {
      label: "direct platform implementation imports",
      edge: {
        from: fixtureSource,
        specifier: "../platform/tauri/core",
        resolved: "src/platform/tauri/core.ts",
        resolvedKind: "source",
      } satisfies ActiveRuntimeEdge,
      ruleLabel: "direct platform implementation imports",
    },
  ])("flags $label as an active-runtime violation", ({ edge, ruleLabel }) => {
    const rule = ACTIVE_RUNTIME_RULES.find((candidate) => candidate.label === ruleLabel);
    expect(rule, `Missing active-runtime rule ${ruleLabel}.`).toBeTruthy();
    expect(findFirstActiveRuntimeViolation([edge], rule!)).toEqual(edge);
  });
});
