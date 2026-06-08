import { invoke } from "./core";
import { isTruthyEnvFlag } from "../shared/analytics-env";

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
  return isTruthyEnvFlag(env.VITE_IRONWING_APTABASE_DISABLED);
}
