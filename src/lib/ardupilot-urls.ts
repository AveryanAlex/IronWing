export const OFFICIAL_ARDUPILOT_AUTOTEST_BASE_URL = "https://autotest.ardupilot.org";
export const OFFICIAL_ARDUPILOT_FIRMWARE_BASE_URL = "https://firmware.ardupilot.org";

type ArduPilotUrlEnv = {
  readonly VITE_IRONWING_ARDUPILOT_AUTOTEST_BASE_URL?: string;
  readonly VITE_IRONWING_ARDUPILOT_FIRMWARE_BASE_URL?: string;
};

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const base = value?.trim() || fallback;
  return base.replace(/\/+$/, "");
}

function joinBaseUrl(baseUrl: string, path: string): string {
  return `${baseUrl}/${path.replace(/^\/+/, "")}`;
}

const env = import.meta.env as ArduPilotUrlEnv;

export const ardupilotAutotestBaseUrl = normalizeBaseUrl(
  env.VITE_IRONWING_ARDUPILOT_AUTOTEST_BASE_URL,
  OFFICIAL_ARDUPILOT_AUTOTEST_BASE_URL,
);

export const ardupilotFirmwareBaseUrl = normalizeBaseUrl(
  env.VITE_IRONWING_ARDUPILOT_FIRMWARE_BASE_URL,
  OFFICIAL_ARDUPILOT_FIRMWARE_BASE_URL,
);

export function ardupilotAutotestUrl(path: string): string {
  return joinBaseUrl(ardupilotAutotestBaseUrl, path);
}

export function ardupilotFirmwareUrl(path: string): string {
  return joinBaseUrl(ardupilotFirmwareBaseUrl, path);
}

export function rewriteArdupilotFirmwareUrl(url: string): string {
  if (ardupilotFirmwareBaseUrl === OFFICIAL_ARDUPILOT_FIRMWARE_BASE_URL) {
    return url;
  }

  const officialPrefix = `${OFFICIAL_ARDUPILOT_FIRMWARE_BASE_URL}/`;
  if (!url.startsWith(officialPrefix)) {
    return url;
  }

  return joinBaseUrl(ardupilotFirmwareBaseUrl, url.slice(officialPrefix.length));
}
