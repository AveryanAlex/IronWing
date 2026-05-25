import {
  initPlatformAnalytics,
  platformAnalyticsEdition,
  trackPlatformEvent,
} from "@platform/analytics";
import { normalizeAnalyticsProperties } from "./events";
import type { AnalyticsEventMap, AnalyticsEventName, AnalyticsStatus } from "./types";

let initializePromise: Promise<AnalyticsStatus> | null = null;
let currentStatus: AnalyticsStatus = {
  enabled: false,
  edition: platformAnalyticsEdition,
};

export function initializeAnalytics(): Promise<AnalyticsStatus> {
  initializePromise ??= initializeAnalyticsPlatform();
  return initializePromise;
}

export function analyticsStatus(): AnalyticsStatus {
  return currentStatus;
}

export function trackAnalytics<K extends AnalyticsEventName>(name: K, props: AnalyticsEventMap[K]): void {
  void trackAnalyticsAsync(name, props).catch(reportAnalyticsError);
}

export async function trackAnalyticsAsync<K extends AnalyticsEventName>(
  name: K,
  props: AnalyticsEventMap[K],
): Promise<void> {
  const status = await initializeAnalytics();
  if (!status.enabled) {
    return;
  }

  await sendPlatformEvent(name, props);
}

async function initializeAnalyticsPlatform(): Promise<AnalyticsStatus> {
  if (import.meta.env.MODE === "test") {
    currentStatus = {
      enabled: false,
      edition: platformAnalyticsEdition,
    };
    return currentStatus;
  }

  try {
    currentStatus = await initPlatformAnalytics();

    if (currentStatus.enabled) {
      void sendPlatformEvent("app_started", {
        edition: currentStatus.edition,
        build: import.meta.env.DEV ? "development" : "production",
      }).catch(reportAnalyticsError);
    }
  } catch (error) {
    currentStatus = {
      enabled: false,
      edition: platformAnalyticsEdition,
    };
    reportAnalyticsError(error);
  }

  return currentStatus;
}

async function sendPlatformEvent<K extends AnalyticsEventName>(
  name: K,
  props: AnalyticsEventMap[K],
): Promise<void> {
  await trackPlatformEvent(name, normalizeAnalyticsProperties({ edition: currentStatus.edition, ...props }));
}

function reportAnalyticsError(error: unknown) {
  console.warn("[ironwing/analytics] analytics event was not sent", error);
}
