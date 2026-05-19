import { invoke } from "./core";

type PlatformAnalyticsProps = Record<string, string | number>;

type PlatformAnalyticsEnv = ImportMetaEnv & {
  VITE_IRONWING_APTABASE_DISABLED?: string;
};

export const platformAnalyticsEdition = "native" as const;

let enabled: boolean | null = null;

export async function initPlatformAnalytics(
  env: PlatformAnalyticsEnv = import.meta.env as PlatformAnalyticsEnv,
): Promise<{ enabled: boolean; edition: typeof platformAnalyticsEdition }> {
  if (isDisabled(env)) {
    enabled = false;
    return status();
  }

  enabled = await invoke<boolean>("analytics_status");
  return status();
}

export async function trackPlatformEvent(name: string, props?: PlatformAnalyticsProps): Promise<void> {
  if (enabled !== true) {
    await initPlatformAnalytics();
  }

  if (!enabled) {
    return;
  }

  await invoke<void>("analytics_track_event", { name, props: props ?? null });
}

function status() {
  return {
    enabled: enabled === true,
    edition: platformAnalyticsEdition,
  };
}

function isDisabled(env: PlatformAnalyticsEnv): boolean {
  const value = env.VITE_IRONWING_APTABASE_DISABLED;
  return value === "1" || value === "true" || value === "TRUE" || value === "yes" || value === "YES";
}
