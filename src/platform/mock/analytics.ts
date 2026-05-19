type PlatformAnalyticsProps = Record<string, string | number>;

export const platformAnalyticsEdition = "mock" as const;

export async function initPlatformAnalytics(): Promise<{ enabled: boolean; edition: typeof platformAnalyticsEdition }> {
  return { enabled: false, edition: platformAnalyticsEdition };
}

export async function trackPlatformEvent(_name: string, _props?: PlatformAnalyticsProps): Promise<void> {
  // Browser E2E runs must never emit production analytics.
}
