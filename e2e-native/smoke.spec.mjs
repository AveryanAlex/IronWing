import assert from "node:assert/strict";

async function waitForCheckpoint(label, predicate, { timeout = 60_000, timeoutMsg }) {
  await browser.waitUntil(predicate, {
    timeout,
    timeoutMsg,
  });
  console.log(`[native smoke] ${label}`);
}

async function readTextContent(selector) {
  return browser.execute((value) => document.querySelector(value)?.textContent?.trim() ?? null, selector);
}

async function readElementValue(selector) {
  return browser.execute((value) => {
    const element = document.querySelector(value);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) {
      return null;
    }

    return element.value;
  }, selector);
}

async function readStoredJson(key) {
  return browser.execute((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return {
        __parse_error: error instanceof Error ? error.message : String(error),
        raw,
      };
    }
  }, key);
}

async function setFieldValue(element, nextValue) {
  const tagName = (await element.getTagName()).toLowerCase();
  if (tagName === "select") {
    await element.selectByAttribute("value", nextValue);
    return;
  }

  await element.clearValue();
  await element.setValue(nextValue);
}

describe("native smoke", () => {
  it("boots the active shell, stages one parameter edit through the shared tray, applies one telemetry setting, persists mpng_settings, and disconnects cleanly", async () => {
    const expectedTcpAddress = process.env.IRONWING_WDIO_TCP_ADDRESS;
    assert.ok(expectedTcpAddress, "IRONWING_WDIO_TCP_ADDRESS is required for the native smoke test.");

    const selectors = {
      statusText: '[data-testid="connection-status-text"]',
      transportSelect: '[data-testid="connection-transport-select"]',
      tcpAddressInput: '[data-testid="connection-tcp-address"]',
      connectButton: '[data-testid="connection-connect-btn"]',
      disconnectButton: '[data-testid="connection-disconnect-btn"]',
      telemetryAltValue: '[data-testid="telemetry-alt-value"]',
      telemetryModeValue: '[data-testid="telemetry-mode-value"]',
      runtimeMarker: '[data-testid="app-runtime-marker"]',
      runtimeFramework: '[data-testid="app-runtime-framework"]',
      runtimeEntrypoint: '[data-testid="app-runtime-entrypoint"]',
      runtimeBoundary: '[data-testid="app-runtime-quarantine-boundary"]',
      parameterWorkspaceButton: '[data-testid="app-shell-parameter-workspace-btn"]',
      parameterWorkspaceRoot: '[data-testid="parameter-workspace"]',
      parameterWorkspaceState: '[data-testid="parameter-workspace-state"]',
      parameterMetadata: '[data-testid="parameter-domain-metadata"]',
      parameterWorkflowSafetyStage: '[data-testid="parameter-workflow-stage-btn-safety"]',
      reviewTray: '[data-testid="app-shell-parameter-review-tray"]',
      reviewToggle: '[data-testid="app-shell-parameter-review-toggle"]',
      reviewSurface: '[data-testid="app-shell-parameter-review-surface"]',
      reviewApply: '[data-testid="app-shell-parameter-review-apply"]',
      telemetryLauncher: '[data-testid="app-shell-telemetry-settings-launcher"]',
      telemetryDialog: '[data-testid="app-shell-telemetry-settings-dialog"]',
      telemetryStatus: '[data-testid="app-shell-telemetry-settings-status"]',
      telemetryInput: '[data-testid="app-shell-telemetry-settings-telemetry-input"]',
      telemetryApply: '[data-testid="app-shell-telemetry-settings-apply"]',
      telemetryClose: '[data-testid="app-shell-telemetry-settings-close"]',
    };

    const statusText = await $(selectors.statusText);
    const transportSelect = await $(selectors.transportSelect);
    const tcpAddressInput = await $(selectors.tcpAddressInput);
    const connectButton = await $(selectors.connectButton);
    const disconnectButton = await $(selectors.disconnectButton);
    const telemetryAltValue = await $(selectors.telemetryAltValue);
    const telemetryModeValue = await $(selectors.telemetryModeValue);
    const parameterWorkspaceButton = await $(selectors.parameterWorkspaceButton);
    const parameterWorkspaceRoot = await $(selectors.parameterWorkspaceRoot);
    const parameterWorkspaceState = await $(selectors.parameterWorkspaceState);
    const parameterMetadata = await $(selectors.parameterMetadata);
    const parameterWorkflowSafetyStage = await $(selectors.parameterWorkflowSafetyStage);
    const reviewTray = await $(selectors.reviewTray);
    const reviewToggle = await $(selectors.reviewToggle);
    const reviewSurface = await $(selectors.reviewSurface);
    const reviewApply = await $(selectors.reviewApply);
    const telemetryLauncher = await $(selectors.telemetryLauncher);
    const telemetryDialog = await $(selectors.telemetryDialog);
    const telemetryStatus = await $(selectors.telemetryStatus);
    const telemetryInput = await $(selectors.telemetryInput);
    const telemetryApply = await $(selectors.telemetryApply);
    const telemetryClose = await $(selectors.telemetryClose);

    await statusText.waitForDisplayed({ timeout: 60_000 });
    await browser.waitUntil(async () => (await browser.getTitle()).includes("IronWing"), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the native IronWing window title.",
    });

    await waitForCheckpoint("active Svelte runtime marker present", async () => {
      const runtimeMarker = await readTextContent(selectors.runtimeMarker);
      return runtimeMarker === "IronWing runtime marker";
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the hidden runtime marker that proves the active Svelte shell mounted.",
    });
    await waitForCheckpoint("runtime framework marker proves Svelte", async () => {
      const framework = await readTextContent(selectors.runtimeFramework);
      const entrypoint = await readTextContent(selectors.runtimeEntrypoint);
      const boundary = await readTextContent(selectors.runtimeBoundary);
      return framework === "Svelte 5" && entrypoint === "src/app/App.svelte" && boundary === "src-old/runtime";
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the hidden runtime markers that distinguish the active Svelte shell from archived runtime surfaces.",
    });

    await waitForCheckpoint("idle shell visible", async () => /Idle/i.test(await statusText.getText()), {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the active shell to report Idle before connect.",
    });

    const currentTransport = await readElementValue(selectors.transportSelect);
    if (currentTransport !== "tcp") {
      await transportSelect.selectByAttribute("value", "tcp");
    }
    await waitForCheckpoint("tcp transport selected for SITL", async () => (await readElementValue(selectors.transportSelect)) === "tcp", {
      timeout: 30_000,
      timeoutMsg: "Timed out selecting TCP transport for the native SITL smoke flow.",
    });

    await setFieldValue(tcpAddressInput, expectedTcpAddress);
    await waitForCheckpoint(`tcp address set to ${expectedTcpAddress}`, async () => (await tcpAddressInput.getValue()) === expectedTcpAddress, {
      timeout: 30_000,
      timeoutMsg: `Timed out waiting for the active shell to use TCP address ${expectedTcpAddress}.`,
    });

    await connectButton.waitForClickable({ timeout: 30_000 });
    await connectButton.click();

    await waitForCheckpoint("connected status reached", async () => /Connected/i.test(await statusText.getText()), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the native app to connect to SITL.",
    });
    await waitForCheckpoint("live telemetry altitude rendered", async () => !(await telemetryAltValue.getText()).includes("-- m"), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for live telemetry altitude after connect.",
    });
    await waitForCheckpoint("live telemetry mode rendered", async () => !(await telemetryModeValue.getText()).includes("--"), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for live telemetry mode after connect.",
    });

    await parameterWorkspaceButton.waitForClickable({ timeout: 30_000 });
    await parameterWorkspaceButton.click();
    await parameterWorkspaceRoot.waitForDisplayed({ timeout: 30_000 });
    await waitForCheckpoint("parameter workspace ready", async () => /Settings ready/i.test(await parameterWorkspaceState.getText()), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the setup workspace to load parameter data from SITL.",
    });

    await waitForCheckpoint("parameter metadata ready for workflow staging", async () => /Info ready/i.test(await parameterMetadata.getText()), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for parameter metadata before staging the shared-tray workflow change.",
    });
    await parameterWorkflowSafetyStage.waitForClickable({ timeout: 30_000 });
    await parameterWorkflowSafetyStage.click();

    await waitForCheckpoint("workflow parameter change staged into shared review tray", async () => await reviewTray.isExisting(), {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the shared review tray after staging the setup workflow change.",
    });
    await reviewToggle.waitForClickable({ timeout: 30_000 });
    await reviewToggle.click();
    await reviewSurface.waitForDisplayed({ timeout: 30_000 });

    await reviewApply.waitForClickable({ timeout: 30_000 });
    await reviewApply.click();
    await waitForCheckpoint("shared review tray cleared after parameter apply", async () => !(await reviewTray.isExisting()), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the shared review tray to clear after applying the staged raw parameter edit.",
    });

    await telemetryLauncher.waitForClickable({ timeout: 30_000 });
    await telemetryLauncher.click();
    await telemetryDialog.waitForDisplayed({ timeout: 30_000 });

    const currentTelemetryRate = Number.parseInt(await telemetryInput.getValue(), 10);
    assert.ok(Number.isFinite(currentTelemetryRate), "Telemetry cadence input should expose a numeric value in the active shell.");
    const nextTelemetryRate = currentTelemetryRate === 6 ? 5 : 6;
    await setFieldValue(telemetryInput, String(nextTelemetryRate));

    await telemetryApply.waitForClickable({ timeout: 30_000 });
    await telemetryApply.click();

    await waitForCheckpoint("telemetry settings apply settled successfully", async () => {
      const statusKind = await telemetryStatus.getAttribute("data-status-kind");
      const statusTextValue = await telemetryStatus.getText();
      return statusKind === "success" && statusTextValue.includes(`${nextTelemetryRate} Hz cadence confirmed`);
    }, {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the telemetry settings dialog to confirm the applied cadence.",
    });

    const persistedSettings = await readStoredJson("mpng_settings");
    console.log(`[native smoke] persisted mpng_settings ${JSON.stringify(persistedSettings)}`);
    assert.ok(persistedSettings && typeof persistedSettings === "object", "Expected mpng_settings to persist as a JSON object.");
    assert.ok(!("__parse_error" in persistedSettings), `mpng_settings should remain valid JSON: ${JSON.stringify(persistedSettings)}`);
    assert.equal(persistedSettings.telemetryRateHz, nextTelemetryRate, "mpng_settings should persist the last applied telemetry cadence.");

    await telemetryClose.waitForClickable({ timeout: 30_000 });
    await telemetryClose.click();

    await disconnectButton.waitForClickable({ timeout: 30_000 });
    await disconnectButton.click();

    await waitForCheckpoint("idle status restored after disconnect", async () => /Idle/i.test(await statusText.getText()), {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the native app to return to Idle after disconnect.",
    });
    await waitForCheckpoint("connect control restored after disconnect", async () => await $(selectors.connectButton).isDisplayed(), {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the active shell to restore the Connect action after disconnect.",
    });
  });
});
