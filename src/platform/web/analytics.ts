import { init, trackEvent, type AptabaseOptions } from "@aptabase/web";

type PlatformAnalyticsProps = Record<string, string | number>;

type PlatformAnalyticsEnv = ImportMetaEnv & {
  VITE_IRONWING_APTABASE_DISABLED?: string;
  VITE_IRONWING_APTABASE_KEY?: string;
  VITE_IRONWING_APTABASE_HOST?: string;
  VITE_IRONWING_APP_VERSION?: string;
};

export const platformAnalyticsEdition = "web" as const;

let initialized = false;
let enabled = false;

export async function initPlatformAnalytics(
  env: PlatformAnalyticsEnv = import.meta.env as PlatformAnalyticsEnv,
): Promise<{ enabled: boolean; edition: typeof platformAnalyticsEdition }> {
  if (initialized) {
    return status();
  }

  initialized = true;

  const appKey = env.VITE_IRONWING_APTABASE_KEY?.trim();
  if (!appKey || isDisabled(env)) {
    enabled = false;
    return status();
  }

  init(appKey, aptabaseOptions(env));
  enabled = true;
  return status();
}

export async function trackPlatformEvent(name: string, props?: PlatformAnalyticsProps): Promise<void> {
  if (!initialized) {
    await initPlatformAnalytics();
  }

  if (!enabled) {
    return;
  }

  await trackEvent(name, props);
}

function status() {
  return {
    enabled,
    edition: platformAnalyticsEdition,
  };
}

function aptabaseOptions(env: PlatformAnalyticsEnv): AptabaseOptions | undefined {
  const options: AptabaseOptions = {};
  const host = env.VITE_IRONWING_APTABASE_HOST?.trim();
  const appVersion = env.VITE_IRONWING_APP_VERSION?.trim();

  if (host) {
    options.host = host;
  }

  if (appVersion) {
    options.appVersion = appVersion;
  }

  return Object.keys(options).length > 0 ? options : undefined;
}

function isDisabled(env: PlatformAnalyticsEnv): boolean {
  return isTruthy(env.VITE_IRONWING_APTABASE_DISABLED);
}

function isTruthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes" || value === "YES";
}
