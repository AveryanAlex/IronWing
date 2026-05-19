type PlatformAnalyticsProps = Record<string, string | number>;

export const platformAnalyticsEdition = "remote" as const;

export async function initPlatformAnalytics(): Promise<{ enabled: boolean; edition: typeof platformAnalyticsEdition }> {
  return { enabled: false, edition: platformAnalyticsEdition };
}

export async function trackPlatformEvent(_name: string, _props?: PlatformAnalyticsProps): Promise<void> {
  // Agent remote UI is dev-only and must not duplicate native analytics.
}
