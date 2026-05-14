import assert from "node:assert/strict";

const LOG_PROGRESS = process.env.IRONWING_NATIVE_E2E_VERBOSE === "1" || process.env.IRONWING_NATIVE_E2E_PROGRESS === "1";

function logProgress(message) {
  if (LOG_PROGRESS) {
    console.log(message);
  }
}

async function waitForCheckpoint(label, predicate, { timeout = 60_000, timeoutMsg }) {
  const msg = timeoutMsg || `${label}: timed out after ${timeout / 1000}s`;
  const hardDeadline = new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error(msg)), timeout);
    timer.unref();
  });

  await Promise.race([
    browser.waitUntil(predicate, { timeout, timeoutMsg: msg }),
    hardDeadline,
  ]);
  logProgress(`[native smoke] ${label}`);
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

// Click helper that works around a tauri-driver + Svelte 5 interaction. tauri-driver
// (0.1.3) dispatches synthetic WebDriver clicks at screen coordinates derived from the
// element's bounding rect at waitForClickable time. Once the audited setup nav grew
// past the 1280x840 window height, lower-group buttons like RC receiver / calibration
// sit below the fold, and tauri-driver's click lands offscreen; even scrollIntoView
// beforehand doesn't help because the click coordinate is already resolved. On top of
// that, some shell-sticky buttons (review toggle, apply, dismiss) are inside nested
// overlay containers where the same coordinate drift produces silent misses. Firing
// the click via JS sidesteps all of it: same trusted-click-from-user-perspective
// behavior Svelte 5 registers through its onclick delegation, zero viewport math.
async function clickIntoView(element) {
  await element.waitForClickable({ timeout: 30_000 });
  await element.scrollIntoView({ block: "center", inline: "nearest" });
  await browser.execute((el) => (el instanceof HTMLElement ? el.click() : null), element);
}

async function clickMenuItem(trigger, itemSelector) {
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await clickIntoView(trigger);
  }
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

async function readConnectionDiagnostics(selectors) {
  return {
    lastPhase: await readTextContent(selectors.connectionDiagnosticsLastPhase),
    activeSource: await readTextContent(selectors.connectionDiagnosticsActiveSource),
    envelope: await readTextContent(selectors.connectionDiagnosticsEnvelope),
  };
}

async function waitForMissionActionCycle(selectors, titleSubstring, label) {
  await waitForCheckpoint(`${label} surfaced inline mission status`, async () => {
    const message = await readTextContent(selectors.missionInlineStatusMessage);
    return typeof message === "string" && message.includes(titleSubstring);
  }, {
    timeout: 30_000,
    timeoutMsg: `${label} never surfaced the expected inline Mission status copy (${titleSubstring}).`,
  });

  await waitForCheckpoint(`${label} settled`, async () => (await readElementCount(selectors.missionInlineStatus)) === 0, {
    timeout: 120_000,
    timeoutMsg: `${label} never cleared the inline Mission status surface.`,
  });
}

describe("native smoke", () => {
  it("boots the active shell, applies one setup channel-order change through the shared tray, proves compass lifecycle/status on Setup, applies one telemetry setting, uploads a real mission waypoint, reads it back, persists ironwing.settings, and disconnects cleanly", async () => {
    const expectedTcpAddress = process.env.IRONWING_WDIO_TCP_ADDRESS;
    assert.ok(expectedTcpAddress, "IRONWING_WDIO_TCP_ADDRESS is required for the native smoke test.");

    const selectors = {
      statusText: '[data-testid="connection-status-text"]',
      transportSelect: '[data-testid="connection-transport-select"]',
      tcpAddressInput: '[data-testid="connection-tcp-address"]',
      connectButton: '[data-testid="connection-connect-btn"]',
      disconnectButton: '[data-testid="connection-disconnect-btn"]',
      connectionDiagnosticsLastPhase: '[data-testid="connection-diagnostics-last-phase"]',
      connectionDiagnosticsActiveSource: '[data-testid="connection-diagnostics-active-source"]',
      connectionDiagnosticsEnvelope: '[data-testid="connection-diagnostics-envelope"]',
      telemetryAltValue: '[data-testid="telemetry-alt-value"]',
      telemetryModeValue: '[data-testid="telemetry-mode-value"]',
      runtimeMarker: '[data-testid="app-runtime-marker"]',
      runtimeFramework: '[data-testid="app-runtime-framework"]',
      runtimeEntrypoint: '[data-testid="app-runtime-entrypoint"]',
      activeWorkspace: '[data-testid="app-shell-active-workspace"]',
      overviewWorkspaceButton: '[data-testid="app-shell-overview-workspace-btn"]',
      missionWorkspaceButton: '//nav[@aria-label="Primary"]//button[normalize-space()="Mission"]',
      setupWorkspaceButton: '[data-testid="app-shell-parameter-workspace-btn"]',
      setupWorkspaceRoot: '[data-testid="setup-workspace"]',
      setupState: '[data-testid="setup-workspace-state"]',
      setupMetadata: '[data-testid="setup-workspace-metadata"]',
      setupSelectedSection: '[data-testid="setup-workspace-selected-section"]',
      setupNavRcReceiver: '[data-testid="setup-workspace-nav-rc_receiver"]',
      setupNavCalibration: '[data-testid="setup-workspace-nav-calibration"]',
      setupRcSection: '[data-testid="setup-workspace-rc-section"]',
      setupRcSignal: '[data-testid="setup-workspace-rc-signal"]',
      setupRcCurrentRoll: '[data-testid="setup-workspace-rc-current-RCMAP_ROLL"]',
      setupRcPresetTaer: '[data-testid="setup-workspace-rc-preset-taer"]',
      setupCheckpoint: '[data-testid="setup-workspace-checkpoint"]',
      setupCheckpointTitle: '[data-testid="setup-workspace-checkpoint-title"]',
      setupCheckpointDetail: '[data-testid="setup-workspace-checkpoint-detail"]',
      setupCheckpointDismiss: '[data-testid="setup-workspace-checkpoint-dismiss"]',
      setupCalibrationSection: '[data-testid="setup-workspace-calibration-section"]',
      setupCalibrationNotices: '[data-testid="setup-workspace-calibration-notices"]',
      setupCalibrationCardRadio: '[data-testid="setup-workspace-calibration-card-radio"]',
      setupCalibrationStatusCompass: '[data-testid="setup-workspace-calibration-status-compass"]',
      setupCalibrationActionCompass: '[data-testid="setup-workspace-calibration-action-compass"]',
      reviewTray: '[data-testid="app-shell-parameter-review-tray"]',
      reviewCount: '[data-testid="app-shell-parameter-review-count"]',
      reviewToggle: '[data-testid="app-shell-parameter-review-toggle"]',
      reviewSurface: '[data-testid="app-shell-parameter-review-surface"]',
      reviewApply: '[data-testid="app-shell-parameter-review-apply"]',
      telemetryLauncher: '[data-testid="app-shell-telemetry-settings-launcher"]',
      telemetryDialog: '[data-testid="app-shell-telemetry-settings-dialog"]',
      telemetryStatus: '[data-testid="app-shell-telemetry-settings-status"]',
      telemetryInput: '[data-testid="app-shell-telemetry-settings-telemetry-input"]',
      telemetryApply: '[data-testid="app-shell-telemetry-settings-apply"]',
      telemetryClose: '[data-testid="app-shell-telemetry-settings-close"]',
      missionRoot: '[data-testid="mission-workspace"]',
      missionEntryNew: '[data-testid="mission-entry-new"]',
      missionReady: '[data-testid="mission-workspace-ready"]',
      missionAttachment: '[data-testid="mission-workspace-attachment"]',
      missionCountsMission: '[data-testid="mission-count-mission-items"]',
      missionInlineStatus: '[data-testid="mission-inline-status"]',
      missionInlineStatusMessage: '[data-testid="mission-inline-status-message"]',
      missionInlineStatusDetail: '[data-testid="mission-inline-status-detail"]',
      missionListAdd: '[data-testid="mission-draft-list-add"]',
      missionInspectorSelectionKind: '[data-testid="mission-inspector-selection-kind"]',
      missionInspectorLatitude: '[data-testid="mission-inspector-latitude"]',
      missionInspectorLongitude: '[data-testid="mission-inspector-longitude"]',
      missionInspectorAltitude: '[data-testid="mission-inspector-altitude"]',
      missionToolbarUpload: '[data-testid="mission-toolbar-upload"]',
      missionToolbarMore: '[data-testid="mission-toolbar-more"]',
      missionToolbarNewMenuItem: '[role="menuitem"][data-testid="mission-toolbar-new"]',
      missionToolbarReadMenuItem: '[role="menuitem"][data-testid="mission-toolbar-read"]',
      missionDraftItem: 'div[role="button"][data-testid^="mission-draft-item-"]',
    };

    const statusText = await $(selectors.statusText);
    const transportSelect = await $(selectors.transportSelect);
    const tcpAddressInput = await $(selectors.tcpAddressInput);
    const connectButton = await $(selectors.connectButton);
    const disconnectButton = await $(selectors.disconnectButton);
    const telemetryAltValue = await $(selectors.telemetryAltValue);
    const telemetryModeValue = await $(selectors.telemetryModeValue);
    const overviewWorkspaceButton = await $(selectors.overviewWorkspaceButton);
    const setupWorkspaceButton = await $(selectors.setupWorkspaceButton);
    const setupWorkspaceRoot = await $(selectors.setupWorkspaceRoot);
    const setupNavRcReceiver = await $(selectors.setupNavRcReceiver);
    const setupNavCalibration = await $(selectors.setupNavCalibration);
    const setupRcSection = await $(selectors.setupRcSection);
    const setupRcPresetTaer = await $(selectors.setupRcPresetTaer);
    const setupCheckpoint = await $(selectors.setupCheckpoint);
    const setupCheckpointDismiss = await $(selectors.setupCheckpointDismiss);
    const setupCalibrationSection = await $(selectors.setupCalibrationSection);
    const setupCalibrationActionCompass = await $(selectors.setupCalibrationActionCompass);
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
    const missionWorkspaceButton = await $(selectors.missionWorkspaceButton);
    const missionRoot = await $(selectors.missionRoot);
    const missionEntryNew = await $(selectors.missionEntryNew);
    const missionReady = await $(selectors.missionReady);
    const missionListAdd = await $(selectors.missionListAdd);
    const missionToolbarUpload = await $(selectors.missionToolbarUpload);
    const missionToolbarMore = await $(selectors.missionToolbarMore);

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
      return framework === "Svelte 5" && entrypoint === "src/app/App.svelte";
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the hidden runtime markers that distinguish the active Svelte shell from archived runtime surfaces.",
    });

    await waitForCheckpoint("idle shell visible", async () => /Idle/i.test(await statusText.getText()), {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the active shell to report Idle before connect.",
    });
    if ((await readTextContent(selectors.activeWorkspace)) !== "overview") {
      await clickIntoView(overviewWorkspaceButton);
    }
    await waitForCheckpoint("overview workspace selected for telemetry proof", async () => {
      return (await readTextContent(selectors.activeWorkspace)) === "overview";
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out returning the native shell to Overview before telemetry assertions.",
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

    await clickIntoView(connectButton);

    try {
      await waitForCheckpoint("connected status reached", async () => /Connected/i.test(await statusText.getText()), {
        timeout: 120_000,
        timeoutMsg: "Timed out waiting for the native app to connect to SITL.",
      });
    } catch (error) {
      const diagnostics = await readConnectionDiagnostics(selectors);
      throw new Error(
        `${error instanceof Error ? error.message : String(error)} Last connection diagnostics: phase=${diagnostics.lastPhase ?? "missing"}, source=${diagnostics.activeSource ?? "missing"}, envelope=${diagnostics.envelope ?? "missing"}.`,
      );
    }

    await waitForCheckpoint("live telemetry altitude rendered", async () => !(await telemetryAltValue.getText()).includes("-- m"), {
      timeout: 120_000,
      timeoutMsg: "Timed out waiting for live telemetry altitude after connect.",
    });
    await waitForCheckpoint("live telemetry mode rendered", async () => !(await telemetryModeValue.getText()).includes("--"), {
      timeout: 120_000,
      timeoutMsg: "Timed out waiting for live telemetry mode after connect.",
    });

    await clickIntoView(setupWorkspaceButton);
    await setupWorkspaceRoot.waitForDisplayed({ timeout: 30_000 });
    await waitForCheckpoint("setup workspace mounted", async () => await setupWorkspaceRoot.isDisplayed(), {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the dedicated setup workspace root to mount.",
    });
    await waitForCheckpoint("setup metadata ready for guided sections", async () => {
      const metadataText = await readTextContent(selectors.setupMetadata);
      return typeof metadataText === "string" && /Metadata ready/i.test(metadataText);
    }, {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for setup metadata before staging the setup channel-order change.",
    });

    await clickIntoView(setupNavRcReceiver);
    await setupRcSection.waitForDisplayed({ timeout: 30_000 });
    await waitForCheckpoint("RC receiver section active", async () => {
      const selected = await readTextContent(selectors.setupSelectedSection);
      return selected === "rc_receiver" && await setupRcSection.isDisplayed();
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the Setup workspace to activate the RC receiver section.",
    });
    await waitForCheckpoint("RC receiver parameter rows hydrated", async () => {
      const setupState = await readTextContent(selectors.setupState);
      const currentRoll = await readTextContent(selectors.setupRcCurrentRoll);
      return typeof currentRoll === "string"
        && !currentRoll.includes("Unavailable")
        && typeof setupState === "string"
        && !setupState.includes("Bootstrapping");
    }, {
      timeout: 120_000,
      timeoutMsg: "Timed out waiting for the Setup RC receiver mapping rows to hydrate from the live parameter store.",
    });
    await waitForCheckpoint("RC receiver controls report live or waiting state", async () => {
      const rcSignal = await readTextContent(selectors.setupRcSignal);
      return typeof rcSignal === "string" && rcSignal.length > 0;
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the Setup RC receiver section to surface its current signal state.",
    });

    await clickIntoView(setupRcPresetTaer);

    await waitForCheckpoint("setup RC preset staged into shared review tray", async () => await reviewTray.isExisting(), {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the shared review tray after staging the setup RC preset.",
    });
    await clickIntoView(reviewToggle);
    await reviewSurface.waitForDisplayed({ timeout: 30_000 });
    await waitForCheckpoint("setup review tray shows queued RC rows", async () => {
      const countText = await readTextContent(selectors.reviewCount);
      const reviewText = await readTextContent(selectors.reviewSurface);
      return typeof countText === "string"
        && countText.includes("3 queued")
        && typeof reviewText === "string"
        && reviewText.includes("RCMAP_ROLL")
        && reviewText.includes("RCMAP_PITCH")
        && reviewText.includes("RCMAP_THROTTLE");
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the shared review tray to show the three queued setup RC mapping rows.",
    });

    await clickIntoView(reviewApply);
    await waitForCheckpoint("shared review tray cleared after setup apply", async () => !(await reviewTray.isExisting()), {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the shared review tray to clear after applying the staged setup RC mapping change.",
    });
    await waitForCheckpoint("setup reboot checkpoint surfaced", async () => {
      const title = await readTextContent(selectors.setupCheckpointTitle);
      const detail = await readTextContent(selectors.setupCheckpointDetail);
      return await setupCheckpoint.isDisplayed()
        && typeof title === "string"
        && title.includes("Reconnect required")
        && typeof detail === "string"
        && detail.includes("Reboot-required setup changes were confirmed through the shared review tray");
    }, {
      timeout: 60_000,
      timeoutMsg: "Timed out waiting for the setup reboot checkpoint banner after applying the staged channel-order change.",
    });

    await clickIntoView(setupCheckpointDismiss);
    await waitForCheckpoint("setup checkpoint dismissed", async () => (await readElementCount(selectors.setupCheckpoint)) === 0, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the setup reboot checkpoint banner to dismiss.",
    });

    await clickIntoView(telemetryLauncher);
    await telemetryDialog.waitForDisplayed({ timeout: 30_000 });

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
    await waitForCheckpoint("telemetry toast cleared", async () => await browser.execute(
      () => document.querySelector('[data-sonner-toaster]') === null,
    ), {
      timeout: 10_000,
      timeoutMsg: "Timed out waiting for the telemetry confirmation toast to clear before continuing the native mission flow.",
    });

    await clickIntoView(missionWorkspaceButton);
    await missionRoot.waitForDisplayed({ timeout: 30_000 });
    await waitForCheckpoint("mission workspace tab active", async () => (await readTextContent(selectors.activeWorkspace)) === "mission", {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the shell to activate the Mission workspace.",
    });
    await clickIntoView(missionEntryNew);
    await missionReady.waitForDisplayed({ timeout: 30_000 });

    await waitForCheckpoint("mission workspace attached to the live session", async () => {
      const attachment = await readTextContent(selectors.missionAttachment);
      return typeof attachment === "string" && attachment.includes("Live attached");
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the Mission workspace to report a live-attached draft.",
    });

    await clickIntoView(missionListAdd);
    await waitForCheckpoint("manual mission item selected", async () => {
      const selectionKind = await readTextContent(selectors.missionInspectorSelectionKind);
      return typeof selectionKind === "string" && selectionKind.includes("mission-item");
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the Mission inspector to focus the new waypoint.",
    });
    await waitForCheckpoint("one mission item visible in the planner counts", async () => {
      const counts = await readMissionCounts(selectors.missionCountsMission);
      return counts?.mission === 1 && counts?.survey === 0;
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the Mission workspace to report one staged manual item.",
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

    await waitForCheckpoint("primary waypoint latitude committed through the Mission inspector", async () => {
      const value = await readNumericValue(selectors.missionInspectorLatitude);
      return value !== null && Math.abs(value - primaryWaypoint.latitude) < 0.00001;
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the primary Mission inspector latitude edit to commit.",
    });
    await waitForCheckpoint("primary waypoint longitude committed through the Mission inspector", async () => {
      const value = await readNumericValue(selectors.missionInspectorLongitude);
      return value !== null && Math.abs(value - primaryWaypoint.longitude) < 0.00001;
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the primary Mission inspector longitude edit to commit.",
    });
    await waitForCheckpoint("primary waypoint altitude committed through the Mission inspector", async () => {
      const value = await readNumericValue(selectors.missionInspectorAltitude);
      return value !== null && Math.abs(value - primaryWaypoint.altitude) < 0.01;
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the primary Mission inspector altitude edit to commit.",
    });
    await waitForCheckpoint("primary waypoint summary rendered in the mission list", async () => {
      const itemTexts = await readAllTextContents(selectors.missionDraftItem);
      return itemTexts[0]?.includes("47.53010") && itemTexts[0]?.includes("8.63010");
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the mission list to reflect the primary waypoint coordinates.",
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

    await waitForCheckpoint("secondary waypoint latitude committed through the Mission inspector", async () => {
      const value = await readNumericValue(selectors.missionInspectorLatitude);
      return value !== null && Math.abs(value - secondaryWaypoint.latitude) < 0.00001;
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the secondary Mission inspector latitude edit to commit.",
    });
    await waitForCheckpoint("secondary waypoint longitude committed through the Mission inspector", async () => {
      const value = await readNumericValue(selectors.missionInspectorLongitude);
      return value !== null && Math.abs(value - secondaryWaypoint.longitude) < 0.00001;
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the secondary Mission inspector longitude edit to commit.",
    });
    await waitForCheckpoint("secondary waypoint altitude committed through the Mission inspector", async () => {
      const value = await readNumericValue(selectors.missionInspectorAltitude);
      return value !== null && Math.abs(value - secondaryWaypoint.altitude) < 0.01;
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the secondary Mission inspector altitude edit to commit.",
    });
    await waitForCheckpoint("secondary waypoint summary rendered in the mission list", async () => {
      const itemTexts = await readAllTextContents(selectors.missionDraftItem);
      return itemTexts[1]?.includes("47.53120") && itemTexts[1]?.includes("8.63120");
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the mission list to reflect the secondary waypoint coordinates.",
    });

    await clickIntoView(missionToolbarUpload);
    await waitForMissionActionCycle(selectors, "Uploading planning state", "mission upload");

    await clickMenuItem(missionToolbarMore, selectors.missionToolbarNewMenuItem);
    await waitForCheckpoint("local mission draft reset to blank", async () => {
      const counts = await readMissionCounts(selectors.missionCountsMission);
      return counts?.mission === 0 && counts?.survey === 0;
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the local Mission draft to reset after upload.",
    });

    await clickMenuItem(missionToolbarMore, selectors.missionToolbarReadMenuItem);
    await waitForMissionActionCycle(selectors, "Reading planning state", "mission readback");
    await waitForCheckpoint("vehicle readback restored two mission items", async () => {
      const counts = await readMissionCounts(selectors.missionCountsMission);
      return counts?.mission === 2 && counts?.survey === 0;
    }, {
      timeout: 120_000,
      timeoutMsg: "Timed out waiting for the Mission workspace to read back the uploaded waypoints.",
    });
    await waitForCheckpoint("readback rendered exactly two manual mission cards", async () => (await readElementCount(selectors.missionDraftItem)) === 2, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the Mission list to render exactly two readback waypoint cards.",
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
    logProgress(`[native smoke] persisted ironwing.settings ${JSON.stringify(persistedSettings)}`);
    assert.ok(persistedSettings && typeof persistedSettings === "object", "Expected ironwing.settings to persist as a JSON object.");
    assert.ok(!("__parse_error" in persistedSettings), `ironwing.settings should remain valid JSON: ${JSON.stringify(persistedSettings)}`);
    assert.equal(persistedSettings.telemetryRateHz, nextTelemetryRate, "ironwing.settings should persist the last applied telemetry cadence.");

    await clickIntoView(setupWorkspaceButton);
    await setupWorkspaceRoot.waitForDisplayed({ timeout: 30_000 });
    await waitForCheckpoint("setup workspace returned for calibration proof", async () => (await readTextContent(selectors.activeWorkspace)) === "setup", {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting to return to the Setup workspace for the native calibration proof.",
    });

    await clickIntoView(setupNavCalibration);
    await setupCalibrationSection.waitForDisplayed({ timeout: 30_000 });
    await waitForCheckpoint("calibration section active", async () => {
      const selected = await readTextContent(selectors.setupSelectedSection);
      return selected === "calibration" && await setupCalibrationSection.isDisplayed();
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the Setup workspace to activate the calibration section.",
    });
    await waitForCheckpoint("radio calibration remains explicitly unavailable", async () => {
      const radioCard = await readTextContent(selectors.setupCalibrationCardRadio);
      return typeof radioCard === "string" && radioCard.includes("Unavailable");
    }, {
      timeout: 30_000,
      timeoutMsg: "Timed out waiting for the Setup calibration section to surface the radio-calibration unavailable state.",
    });

    const calibrationNoticesBeforeStart = await readTextContent(selectors.setupCalibrationNotices);
    await clickIntoView(setupCalibrationActionCompass);

    await waitForCheckpoint("compass lifecycle or native setup notice surfaced", async () => {
      const status = await readTextContent(selectors.setupCalibrationStatusCompass);
      const actionLabel = await readTextContent(selectors.setupCalibrationActionCompass);
      const notices = await readTextContent(selectors.setupCalibrationNotices);
      return (typeof status === "string" && !status.includes("Not started"))
        || (typeof actionLabel === "string" && actionLabel.includes("Cancel compass calibration"))
        || (
          typeof notices === "string"
          && /compass|calibrat/i.test(notices)
          && notices !== calibrationNoticesBeforeStart
        );
    }, {
      timeout: 120_000,
      timeoutMsg: "Timed out waiting for the native Setup workspace to surface either a compass lifecycle change or fresh compass-related setup status text after starting calibration.",
    });
    await waitForCheckpoint("compass status text surfaced on setup calibration notices", async () => {
      const notices = await readTextContent(selectors.setupCalibrationNotices);
      if (typeof notices !== "string" || notices.length === 0 || !/compass|calibrat/i.test(notices)) {
        return false;
      }

      return typeof calibrationNoticesBeforeStart !== "string"
        || !/compass|calibrat/i.test(calibrationNoticesBeforeStart)
        || notices !== calibrationNoticesBeforeStart;
    }, {
      timeout: 120_000,
      timeoutMsg: "Timed out waiting for the Setup calibration section to surface fresh compass-related status text.",
    });

    await clickIntoView(disconnectButton);

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
