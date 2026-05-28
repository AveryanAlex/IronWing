import assert from "node:assert/strict";

const LOG_PROGRESS = process.env.IRONWING_NATIVE_E2E_VERBOSE === "1" || process.env.IRONWING_NATIVE_E2E_PROGRESS === "1";

function logProgress(message) {
  if (LOG_PROGRESS) {
    console.log(message);
  }
}

async function waitForCheckpoint(label, predicate, { timeout = 60_000, timeoutMsg } = {}) {
  const msg = timeoutMsg || `${label}: timed out after ${timeout / 1000}s`;
  const hardDeadline = new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error(msg)), timeout);
    timer.unref();
  });

  await Promise.race([
    browser.waitUntil(predicate, { timeout, timeoutMsg: msg }),
    hardDeadline,
  ]);
  logProgress(`[native e2e] ${label}`);
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

async function readElementCount(selector) {
  return browser.execute((value) => document.querySelectorAll(value).length, selector);
}

async function readAllTextContents(selector) {
  return browser.execute(
    (value) => Array.from(document.querySelectorAll(value)).map((element) => element.textContent?.trim() ?? ""),
    selector,
  );
}

async function readClassName(selector) {
  return browser.execute((value) => document.querySelector(value)?.className?.toString() ?? null, selector);
}

async function isSelectorVisible(selector) {
  return browser.execute((value) => {
    const element = document.querySelector(value);
    if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }, selector);
}

async function isControlEnabled(selector) {
  return browser.execute((value) => {
    const element = document.querySelector(value);
    if (!(element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
      return false;
    }

    return !element.disabled;
  }, selector);
}

async function transportOptionReady(selector, optionValue) {
  return browser.execute((valueSelector, value) => {
    const element = document.querySelector(valueSelector);
    if (!(element instanceof HTMLSelectElement)) {
      return false;
    }

    const option = Array.from(element.options).find((item) => item.value === value);
    return Boolean(option && !option.disabled);
  }, selector, optionValue);
}

async function readConnectionDiagnostics(selectors) {
  return {
    lastPhase: await readTextContent(selectors.connectionDiagnosticsLastPhase),
    activeSource: await readTextContent(selectors.connectionDiagnosticsActiveSource),
    envelope: await readTextContent(selectors.connectionDiagnosticsEnvelope),
    bootstrap: await readTextContent(selectors.connectionDiagnosticsBootstrap),
    error: await readTextContent(selectors.connectionError),
  };
}

// Click helper that works around tauri-driver coordinate drift. Firing the
// element click through JS still exercises the Svelte event handlers without
// depending on native WebDriver viewport math.
async function clickIntoView(element) {
  await element.waitForClickable({ timeout: 30_000 });
  await element.scrollIntoView({ block: "center", inline: "nearest" });
  await browser.execute((el) => (el instanceof HTMLElement ? el.click() : null), element);
}

async function clickMenuItem(trigger, itemSelector) {
  await clickIntoView(trigger);
  const item = await $(itemSelector);
  await clickIntoView(item);
}

async function setCommittedFieldValue(selector, nextValue) {
  return browser.execute((valueSelector, value) => {
    const element = document.querySelector(valueSelector);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) {
      return null;
    }

    element.focus();
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.blur();
    return element.value;
  }, selector, nextValue);
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

async function readNumericValue(selector) {
  const rawValue = await readElementValue(selector);
  const parsed = Number.parseFloat(rawValue ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

async function readMissionCounts(selector) {
  const text = await readTextContent(selector);
  const match = text?.match(/·\s*(\d+)\s*\/\s*(\d+)/);
  if (!match) {
    return null;
  }

  return {
    mission: Number.parseInt(match[1], 10),
    survey: Number.parseInt(match[2], 10),
  };
}

async function expectConnectionIdle(selectors, { timeout = 60_000, label = "idle connection controls visible" } = {}) {
  await waitForCheckpoint(label, async () => {
    return await isSelectorVisible(selectors.connectButton)
      && await isControlEnabled(selectors.connectButton)
      && (await readElementCount(selectors.cancelButton)) === 0
      && (await readElementCount(selectors.disconnectButton)) === 0;
  }, {
    timeout,
    timeoutMsg: "Timed out waiting for the native shell to expose the idle Connect action.",
  });
}

async function expectConnectionConnected(selectors, { timeout = 120_000, label = "connected connection controls visible" } = {}) {
  await waitForCheckpoint(label, async () => {
    return await isSelectorVisible(selectors.disconnectButton)
      && await isControlEnabled(selectors.disconnectButton)
      && (await readElementCount(selectors.connectButton)) === 0
      && (await readElementCount(selectors.cancelButton)) === 0;
  }, {
    timeout,
    timeoutMsg: "Timed out waiting for the native shell to expose the connected Disconnect action.",
  });
}

describe("native real-stack workflows", () => {
  it("boots the active shell, connects to SITL, applies telemetry settings, transfers a mission, and disconnects cleanly", async () => {
    const expectedTcpAddress = process.env.IRONWING_WDIO_TCP_ADDRESS;
    assert.ok(expectedTcpAddress, "IRONWING_WDIO_TCP_ADDRESS is required for the native E2E workflow.");

    const selectors = {
      transportSelect: '[data-testid="connection-transport-select"]',
      tcpAddressInput: '[data-testid="connection-tcp-address"]',
      connectButton: '[data-testid="connection-connect-btn"]',
      cancelButton: '[data-testid="connection-cancel-btn"]',
      disconnectButton: '[data-testid="connection-disconnect-btn"]',
      connectionError: '[data-testid="connection-error-message"]',
      connectionDiagnosticsLastPhase: '[data-testid="connection-diagnostics-last-phase"]',
      connectionDiagnosticsActiveSource: '[data-testid="connection-diagnostics-active-source"]',
      connectionDiagnosticsEnvelope: '[data-testid="connection-diagnostics-envelope"]',
      connectionDiagnosticsBootstrap: '[data-testid="connection-diagnostics-bootstrap"]',
      connectionIndicator: '[data-testid="app-shell-connection-indicator"]',
      telemetryAltValue: '[data-testid="telemetry-alt-value"]',
      telemetryModeValue: '[data-testid="telemetry-mode-value"]',
      telemetryLauncher: '[data-testid="app-shell-telemetry-settings-launcher"]',
      telemetryDialog: '[data-testid="app-shell-telemetry-settings-dialog"]',
      telemetryStatus: '[data-testid="app-shell-telemetry-settings-status"]',
      telemetryInput: '[data-testid="app-shell-telemetry-settings-telemetry-input"]',
      telemetryApply: '[data-testid="app-shell-telemetry-settings-apply"]',
      telemetryClose: '[data-testid="app-shell-telemetry-settings-close"]',
      runtimeMarker: '[data-testid="app-runtime-marker"]',
      runtimeFramework: '[data-testid="app-runtime-framework"]',
      runtimeEntrypoint: '[data-testid="app-runtime-entrypoint"]',
      activeWorkspace: '[data-testid="app-shell-active-workspace"]',
      overviewWorkspaceButton: '[data-testid="app-shell-overview-workspace-btn"]',
      operatorWorkspace: '[data-testid="app-shell-operator-workspace"]',
      missionWorkspaceButton: '//nav[@aria-label="Primary"]//button[normalize-space()="Mission"]',
      missionRoot: '[data-testid="mission-workspace"]',
      missionReady: '[data-testid="mission-workspace-ready"]',
      missionAttachment: '[data-testid="mission-workspace-attachment"]',
      missionCountsMission: '[data-testid="mission-count-mission-items"]',
      missionListAdd: '[data-testid="mission-draft-list-add"]',
      missionInspectorSelectionKind: '[data-testid="mission-inspector-selection-kind"]',
      missionInspectorLatitude: '[data-testid="mission-inspector-latitude"]',
      missionInspectorLongitude: '[data-testid="mission-inspector-longitude"]',
      missionInspectorAltitude: '[data-testid="mission-inspector-altitude"]',
      missionToolbarUpload: '[data-testid="mission-toolbar-upload"]',
      missionToolbarMore: '[data-testid="mission-toolbar-more"]',
      missionToolbarNewMenuItem: '[data-testid="mission-toolbar-new"]',
      missionToolbarReadMenuItem: '[data-testid="mission-toolbar-read"]',
      missionDraftItem: 'div[role="button"][data-testid^="mission-draft-item-"]',
    };

    const transportSelect = await $(selectors.transportSelect);
    const tcpAddressInput = await $(selectors.tcpAddressInput);
    const connectButton = await $(selectors.connectButton);
    const disconnectButton = await $(selectors.disconnectButton);
    const overviewWorkspaceButton = await $(selectors.overviewWorkspaceButton);
    const telemetryLauncher = await $(selectors.telemetryLauncher);
    const telemetryDialog = await $(selectors.telemetryDialog);
    const telemetryStatus = await $(selectors.telemetryStatus);
    const telemetryInput = await $(selectors.telemetryInput);
    const telemetryApply = await $(selectors.telemetryApply);
    const telemetryClose = await $(selectors.telemetryClose);
    const missionWorkspaceButton = await $(selectors.missionWorkspaceButton);
    const missionRoot = await $(selectors.missionRoot);
    const missionReady = await $(selectors.missionReady);
    const missionListAdd = await $(selectors.missionListAdd);
    const missionToolbarUpload = await $(selectors.missionToolbarUpload);
    const missionToolbarMore = await $(selectors.missionToolbarMore);

    await waitForCheckpoint("native IronWing window title present", async () => (await browser.getTitle()).includes("IronWing"), {
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
      return framework === "Svelte 5" && entrypoint === "src/routes/+page.svelte";
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the hidden runtime markers that distinguish the active Svelte shell from archived runtime surfaces.",
    });

    if ((await readTextContent(selectors.activeWorkspace)) !== "overview") {
      await clickIntoView(overviewWorkspaceButton);
    }
    await waitForCheckpoint("overview operator workspace mounted", async () => {
      return (await readTextContent(selectors.activeWorkspace)) === "overview"
        && await isSelectorVisible(selectors.operatorWorkspace);
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the native shell to mount the Overview operator workspace.",
    });

    await waitForCheckpoint("session diagnostics hydrated", async () => {
      const bootstrap = await readTextContent(selectors.connectionDiagnosticsBootstrap);
      const lastPhase = await readTextContent(selectors.connectionDiagnosticsLastPhase);
      return bootstrap === "ready" && lastPhase === "ready";
    }, {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the native connection diagnostics to hydrate.",
    });

    await waitForCheckpoint("tcp transport option ready for SITL", async () => transportOptionReady(selectors.transportSelect, "tcp"), {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the active shell to expose the TCP transport option.",
    });
    if ((await readElementValue(selectors.transportSelect)) !== "tcp") {
      await setFieldValue(transportSelect, "tcp");
    }
    await waitForCheckpoint("tcp transport selected for SITL", async () => (await readElementValue(selectors.transportSelect)) === "tcp", {
      timeout: 30_000,
      timeoutMsg: "Timed out selecting TCP transport for the native SITL smoke flow.",
    });

    await setFieldValue(tcpAddressInput, expectedTcpAddress);
    await waitForCheckpoint(`tcp address set to ${expectedTcpAddress}`, async () => (await readElementValue(selectors.tcpAddressInput)) === expectedTcpAddress, {
      timeout: 30_000,
      timeoutMsg: `Timed out waiting for the active shell to use TCP address ${expectedTcpAddress}.`,
    });

    await expectConnectionIdle(selectors, { timeout: 60_000 });
    await clickIntoView(connectButton);

    await waitForCheckpoint("connection request left idle controls", async () => {
      return await isSelectorVisible(selectors.cancelButton) || await isSelectorVisible(selectors.disconnectButton);
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the native shell to leave idle controls after Connect.",
    });

    try {
      await expectConnectionConnected(selectors);
    } catch (error) {
      const diagnostics = await readConnectionDiagnostics(selectors);
      throw new Error(
        `${error instanceof Error ? error.message : String(error)} Last connection diagnostics: phase=${diagnostics.lastPhase ?? "missing"}, bootstrap=${diagnostics.bootstrap ?? "missing"}, source=${diagnostics.activeSource ?? "missing"}, envelope=${diagnostics.envelope ?? "missing"}, error=${diagnostics.error ?? "none"}.`,
      );
    }

    await waitForCheckpoint("connection diagnostics report live session", async () => {
      const diagnostics = await readConnectionDiagnostics(selectors);
      return diagnostics.activeSource === "live" && typeof diagnostics.envelope === "string" && diagnostics.envelope.includes("session-");
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the native connection diagnostics to report a live session.",
    });

    await waitForCheckpoint("shell connection indicator turned positive", async () => {
      const className = await readClassName(selectors.connectionIndicator);
      return typeof className === "string" && className.includes("is-positive");
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the shell connection indicator to reflect the connected state.",
    });

    await waitForCheckpoint("live telemetry altitude rendered", async () => {
      const altitudeText = await readTextContent(selectors.telemetryAltValue);
      return typeof altitudeText === "string" && !altitudeText.includes("-- m");
    }, {
      timeout: 120_000,
      timeoutMsg: "Timed out waiting for live telemetry altitude after connect.",
    });
    await waitForCheckpoint("live telemetry mode rendered", async () => {
      const modeText = await readTextContent(selectors.telemetryModeValue);
      return typeof modeText === "string" && !modeText.includes("--");
    }, {
      timeout: 120_000,
      timeoutMsg: "Timed out waiting for live telemetry mode after connect.",
    });

    await clickIntoView(telemetryLauncher);
    await telemetryDialog.waitForDisplayed({ timeout: 30_000 });
    await waitForCheckpoint("telemetry settings dialog catalog ready", async () => {
      const statusKind = await telemetryStatus.getAttribute("data-status-kind");
      const statusTextValue = await telemetryStatus.getText();
      return statusKind === "success" && statusTextValue.includes("cadence confirmed");
    }, {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the telemetry settings dialog to load confirmed settings.",
    });

    const currentTelemetryRate = Number.parseInt(await telemetryInput.getValue(), 10);
    assert.ok(Number.isFinite(currentTelemetryRate), "Telemetry cadence input should expose a numeric value in the active shell.");
    const nextTelemetryRate = currentTelemetryRate === 6 ? 5 : 6;
    await setFieldValue(telemetryInput, String(nextTelemetryRate));
    await clickIntoView(telemetryApply);
    await waitForCheckpoint("telemetry settings apply settled successfully", async () => {
      const statusKind = await telemetryStatus.getAttribute("data-status-kind");
      const statusTextValue = await telemetryStatus.getText();
      return statusKind === "success" && statusTextValue.includes(`${nextTelemetryRate} Hz cadence confirmed`);
    }, {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the telemetry settings dialog to confirm the applied cadence.",
    });
    await clickIntoView(telemetryClose);

    await clickIntoView(missionWorkspaceButton);
    await missionRoot.waitForDisplayed({ timeout: 30_000 });
    await waitForCheckpoint("mission workspace tab active", async () => (await readTextContent(selectors.activeWorkspace)) === "mission", {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the shell to activate the Mission workspace.",
    });
    await missionReady.waitForDisplayed({ timeout: 30_000 });
    await waitForCheckpoint("mission workspace attached to the live session", async () => {
      const attachment = await readTextContent(selectors.missionAttachment);
      return typeof attachment === "string" && attachment.includes("Live attached");
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the Mission workspace to report a live-attached draft.",
    });

    await clickMenuItem(missionToolbarMore, selectors.missionToolbarNewMenuItem);
    await waitForCheckpoint("local mission draft reset to blank before native transfer proof", async () => {
      const counts = await readMissionCounts(selectors.missionCountsMission);
      return counts?.mission === 0 && counts?.survey === 0;
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the local Mission draft to reset before adding waypoints.",
    });

    await clickIntoView(missionListAdd);
    await waitForCheckpoint("manual mission item selected", async () => {
      const selectionKind = await readTextContent(selectors.missionInspectorSelectionKind);
      return typeof selectionKind === "string" && selectionKind.includes("mission-item");
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the Mission inspector to focus the new waypoint.",
    });

    const primaryWaypoint = {
      latitude: 47.5301,
      longitude: 8.6301,
      altitude: 123,
    };
    const secondaryWaypoint = {
      latitude: 47.5312,
      longitude: 8.6312,
      altitude: 126,
    };

    await setCommittedFieldValue(selectors.missionInspectorLatitude, String(primaryWaypoint.latitude));
    await setCommittedFieldValue(selectors.missionInspectorLongitude, String(primaryWaypoint.longitude));
    await setCommittedFieldValue(selectors.missionInspectorAltitude, String(primaryWaypoint.altitude));
    await waitForCheckpoint("primary waypoint committed through the Mission inspector", async () => {
      const latitude = await readNumericValue(selectors.missionInspectorLatitude);
      const longitude = await readNumericValue(selectors.missionInspectorLongitude);
      const altitude = await readNumericValue(selectors.missionInspectorAltitude);
      return latitude !== null
        && longitude !== null
        && altitude !== null
        && Math.abs(latitude - primaryWaypoint.latitude) < 0.00001
        && Math.abs(longitude - primaryWaypoint.longitude) < 0.00001
        && Math.abs(altitude - primaryWaypoint.altitude) < 0.01;
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the primary Mission inspector edits to commit.",
    });

    await clickIntoView(missionListAdd);
    await waitForCheckpoint("two mission items visible in the planner counts", async () => {
      const counts = await readMissionCounts(selectors.missionCountsMission);
      return counts?.mission === 2 && counts?.survey === 0;
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the Mission workspace to report two staged manual items.",
    });
    await setCommittedFieldValue(selectors.missionInspectorLatitude, String(secondaryWaypoint.latitude));
    await setCommittedFieldValue(selectors.missionInspectorLongitude, String(secondaryWaypoint.longitude));
    await setCommittedFieldValue(selectors.missionInspectorAltitude, String(secondaryWaypoint.altitude));
    await waitForCheckpoint("secondary waypoint summary rendered in the mission list", async () => {
      const itemTexts = await readAllTextContents(selectors.missionDraftItem);
      return itemTexts[0]?.includes("47.53010")
        && itemTexts[0]?.includes("8.63010")
        && itemTexts[1]?.includes("47.53120")
        && itemTexts[1]?.includes("8.63120");
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the mission list to reflect both waypoint coordinates.",
    });

    await clickIntoView(missionToolbarUpload);
    await waitForCheckpoint("mission upload marked the draft as uploaded", async () => {
      const uploadText = await readTextContent(selectors.missionToolbarUpload);
      return typeof uploadText === "string" && uploadText.includes("Uploaded");
    }, {
      timeout: 120_000,
      timeoutMsg: "Timed out waiting for the Mission workspace to mark the native SITL upload as complete.",
    });
    await clickMenuItem(missionToolbarMore, selectors.missionToolbarNewMenuItem);
    await waitForCheckpoint("local mission draft reset to blank after upload", async () => {
      const counts = await readMissionCounts(selectors.missionCountsMission);
      return counts?.mission === 0 && counts?.survey === 0;
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the local Mission draft to reset after upload.",
    });
    await clickMenuItem(missionToolbarMore, selectors.missionToolbarReadMenuItem);
    await waitForCheckpoint("vehicle readback restored two mission items", async () => {
      const counts = await readMissionCounts(selectors.missionCountsMission);
      return counts?.mission === 2 && counts?.survey === 0;
    }, {
      timeout: 120_000,
      timeoutMsg: "Timed out waiting for the Mission workspace to read back the uploaded waypoints.",
    });

    const [readbackWaypoint] = await $$(selectors.missionDraftItem);
    assert.ok(readbackWaypoint, "Expected a readback waypoint card after reading the vehicle mission.");
    await clickIntoView(readbackWaypoint);
    await waitForCheckpoint("readback waypoint selection returned to the Mission inspector", async () => {
      const selectionKind = await readTextContent(selectors.missionInspectorSelectionKind);
      return typeof selectionKind === "string" && selectionKind.includes("mission-item");
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the Mission inspector to focus the readback waypoint.",
    });

    const readbackLatitude = await readNumericValue(selectors.missionInspectorLatitude);
    const readbackLongitude = await readNumericValue(selectors.missionInspectorLongitude);
    const readbackAltitude = await readNumericValue(selectors.missionInspectorAltitude);
    assert.ok(readbackLatitude !== null, "Mission readback latitude should remain numeric.");
    assert.ok(readbackLongitude !== null, "Mission readback longitude should remain numeric.");
    assert.ok(readbackAltitude !== null, "Mission readback altitude should remain numeric.");
    assert.ok(Math.abs(readbackLatitude - primaryWaypoint.latitude) < 0.00001, `Mission readback latitude drifted: ${readbackLatitude}`);
    assert.ok(Math.abs(readbackLongitude - primaryWaypoint.longitude) < 0.00001, `Mission readback longitude drifted: ${readbackLongitude}`);
    assert.ok(Math.abs(readbackAltitude - primaryWaypoint.altitude) < 0.01, `Mission readback altitude drifted: ${readbackAltitude}`);

    const persistedSettings = await readStoredJson("ironwing.settings");
    logProgress(`[native e2e] persisted ironwing.settings ${JSON.stringify(persistedSettings)}`);
    assert.ok(persistedSettings && typeof persistedSettings === "object", "Expected ironwing.settings to persist as a JSON object.");
    assert.ok(!("__parse_error" in persistedSettings), `ironwing.settings should remain valid JSON: ${JSON.stringify(persistedSettings)}`);
    assert.equal(persistedSettings.telemetryRateHz, nextTelemetryRate, "ironwing.settings should persist the last applied telemetry cadence.");

    await clickIntoView(disconnectButton);
    await expectConnectionIdle(selectors, {
      timeout: 60_000,
      label: "idle connection controls restored after disconnect",
    });
    await waitForCheckpoint("shell connection indicator returned neutral", async () => {
      const className = await readClassName(selectors.connectionIndicator);
      return typeof className === "string" && className.includes("is-neutral");
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the shell connection indicator to reflect the disconnected state.",
    });
  });
});
