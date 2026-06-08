type PlatformAnalyticsProps = Record<string, string | number>;

export const noopAnalyticsEdition = "unavailable" as const;

export async function initNoopPlatformAnalytics(): Promise<{
  enabled: boolean;
  edition: typeof noopAnalyticsEdition;
}> {
  return { enabled: false, edition: noopAnalyticsEdition };
}

export async function trackNoopPlatformEvent(_name: string, _props?: PlatformAnalyticsProps): Promise<void> {
  // No-op platform analytics adapters must never emit production analytics.
}
