import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const HOOK_PATTERN =
  /\b(useState|useCallback|useMemo|useEffect|useRef|useReducer|useContext)\s*[(<]/;

describe("MotorDiagram hook order", () => {
  const src = readFileSync(resolve(__dirname, "MotorDiagram.tsx"), "utf-8");

  it("has no React hook calls after any early return in the component function", () => {
    const fnStart = src.indexOf("export function MotorDiagram(");
    expect(fnStart).toBeGreaterThan(-1);

    const body = src.slice(fnStart);
    const lines = body.split("\n");

    const earlyReturnLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (/^if\s*\(.*\)\s*\{?\s*$/.test(trimmed) || /^if\s*\(.*\)\s*return/.test(trimmed)) {
        const block = lines.slice(i, i + 10).join("\n");
        if (/return\s*[(<]/.test(block)) {
          earlyReturnLines.push(i);
        }
      }
    }

    for (const returnLine of earlyReturnLines) {
      const afterReturn = lines.slice(returnLine + 1);
      const violatingLines = afterReturn
        .map((line, i) => ({ line: line.trim(), num: returnLine + i + 2 }))
        .filter(({ line }) => HOOK_PATTERN.test(line));

      expect(
        violatingLines,
        `Hook calls found after early return at line ${returnLine + 1}:\n${violatingLines.map((v) => `  line ${v.num}: ${v.line}`).join("\n")}`,
      ).toHaveLength(0);
    }
  });

  it("all useMemo/useCallback calls appear before any conditional return", () => {
    const fnStart = src.indexOf("export function MotorDiagram(");
    expect(fnStart).toBeGreaterThan(-1);

    const body = src.slice(fnStart);
    const lines = body.split("\n");

    let firstEarlyReturnLine = -1;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (/^if\s*\(!/.test(trimmed)) {
        const lookahead = lines.slice(i, Math.min(i + 15, lines.length)).join("\n");
        if (/return\s*[(<]/.test(lookahead)) {
          firstEarlyReturnLine = i;
          break;
        }
      }
    }

    if (firstEarlyReturnLine === -1) return;

    const afterEarlyReturn = lines.slice(firstEarlyReturnLine);
    const hookCallsAfter = afterEarlyReturn
      .map((line, i) => ({ line: line.trim(), num: firstEarlyReturnLine + i + 1 }))
      .filter(({ line }) => HOOK_PATTERN.test(line));

    expect(
      hookCallsAfter,
      `React hook calls found after conditional return at line ${firstEarlyReturnLine + 1}. ` +
        `This will crash React when the condition changes.\n` +
        hookCallsAfter.map((v) => `  line ${v.num}: ${v.line}`).join("\n"),
    ).toHaveLength(0);
  });
});

describe("MotorDiagram nose arrow regression", () => {
  const src = readFileSync(resolve(__dirname, "MotorDiagram.tsx"), "utf-8");

  it("does not contain a NoseArrow component or function", () => {
    expect(src).not.toMatch(/function\s+NoseArrow/);
    expect(src).not.toMatch(/<NoseArrow\s*\/?>/);
  });

  it("does not use stroke-danger or fill-danger classes (red arrow styling)", () => {
    expect(src).not.toMatch(/stroke-danger/);
    expect(src).not.toMatch(/fill-danger/);
  });

  it("does not reference NOSE_ARROW_Y constant", () => {
    expect(src).not.toMatch(/NOSE_ARROW_Y/);
  });
});

describe("MotorDiagram unsupported layout fallback", () => {
  const src = readFileSync(resolve(__dirname, "MotorDiagram.tsx"), "utf-8");

  it("renders a fallback placeholder for unsupported layouts", () => {
    expect(src).toMatch(/No layout available|unsupported|not available/i);
  });

  it("getMotorLayout returns null for unsupported frame class/type combos", async () => {
    const { getMotorLayout } = await import("../../data/motor-layouts");
    const result = getMotorLayout(99, 99);
    expect(result).toBeNull();
  });
});
