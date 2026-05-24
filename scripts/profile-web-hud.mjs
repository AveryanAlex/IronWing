import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

import { forwardedArgs } from "./workflow/paths.mjs";
import { parseArgs, resolvePath } from "./workflow/cpu-profile.mjs";

const DEFAULT_URL = "http://127.0.0.1:4173";
const DEFAULT_OUTPUT = "/tmp/opencode/ironwing-airplane-hud.cpuprofile";
const DEFAULT_DURATION_MS = 12_000;
const DEFAULT_SETTLE_MS = 3_000;
const DEFAULT_VEHICLE = "Airplane";

const HELP = `Usage: node scripts/profile-web-hud.mjs [options]

Capture a Chromium CPU profile for the web HUD airplane-loiter scenario.

Options:
  --url <url>               App URL to open. Default: ${DEFAULT_URL}
  --output <path>           Output .cpuprofile path. Default: ${DEFAULT_OUTPUT}
  --vehicle <name>          Demo vehicle preset. Default: ${DEFAULT_VEHICLE}
  --duration-ms <ms>        Sampling duration. Default: ${DEFAULT_DURATION_MS}
  --settle-ms <ms>          Delay before profiling. Default: ${DEFAULT_SETTLE_MS}
  --no-arm                  Skip the Arm click and ARMED wait.
  --help                    Show this message.
`;

const { options } = parseArgs(forwardedArgs());
if (options.help) {
  console.log(HELP);
  process.exit(0);
}

const url = options.url ?? DEFAULT_URL;
const outputPath = resolvePath(options.output ?? DEFAULT_OUTPUT);
const vehicle = options.vehicle ?? DEFAULT_VEHICLE;
const durationMs = parseIntOption(options["duration-ms"], DEFAULT_DURATION_MS, "duration-ms");
const settleMs = parseIntOption(options["settle-ms"], DEFAULT_SETTLE_MS, "settle-ms");
const shouldArm = options["no-arm"] !== true;

await fs.mkdir(path.dirname(outputPath), { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

try {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.selectOption('[data-testid="connection-transport-select"]', "Demo vehicle");
  await page.selectOption('[data-testid="connection-demo-preset"]', vehicle);
  await page.getByTestId("connection-connect-btn").click();
  await page.getByText("Connected").waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("button", { name: "HUD" }).click();

  if (shouldArm) {
    await page.getByRole("button", { name: "Arm", exact: true }).click();
    await page.getByText("ARMED").last().waitFor({ state: "visible", timeout: 10_000 });
  }

  await page.getByText("MODE LOITER").waitFor({ state: "visible", timeout: 10_000 });
  await wait(settleMs);

  const session = await page.context().newCDPSession(page);
  await session.send("Profiler.enable");
  await session.send("Profiler.setSamplingInterval", { interval: 100 });
  await session.send("Profiler.start");
  await wait(durationMs);
  const { profile } = await session.send("Profiler.stop");
  await fs.writeFile(outputPath, JSON.stringify(profile));

  const headingSamples = await page.evaluate(async () => {
    const values = [];
    for (let index = 0; index < 8; index += 1) {
      const match = document.body.innerText.match(/HDG\s+(\d+)°/);
      values.push(match ? Number(match[1]) : null);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return values;
  });

  console.log(JSON.stringify({ ok: true, url, outputPath, durationMs, settleMs, vehicle, headingSamples }, null, 2));
} finally {
  await browser.close();
}

function parseIntOption(value, fallback, name) {
  if (value == null) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected --${name} to be a positive integer, got: ${value}`);
  }

  return parsed;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
