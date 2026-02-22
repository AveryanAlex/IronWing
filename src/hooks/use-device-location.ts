import { useCallback, useEffect, useRef, useState } from "react";

export type DeviceLocation = {
  latitude_deg: number;
  longitude_deg: number;
  accuracy_m: number;
};

type WatchState = {
  location: DeviceLocation | null;
  supported: boolean;
  permissionDenied: boolean;
  watching: boolean;
  startWatching: () => void;
  stopWatching: () => void;
};

function startBrowserWatch(
  setLocation: (loc: DeviceLocation) => void,
  setPermissionDenied: (v: boolean) => void,
  setSupported: (v: boolean) => void,
): number | null {
  if (!navigator.geolocation) return null;
  return navigator.geolocation.watchPosition(
    (pos) => {
      setLocation({
        latitude_deg: pos.coords.latitude,
        longitude_deg: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy,
      });
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        setPermissionDenied(true);
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        setSupported(false);
      }
    },
    { enableHighAccuracy: true },
  );
}

export function useDeviceLocation(): WatchState {
  const [location, setLocation] = useState<DeviceLocation | null>(null);
  const [supported, setSupported] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [watching, setWatching] = useState(false);

  const browserWatchIdRef = useRef<number | null>(null);
  const tauriCleanupRef = useRef<(() => void) | null>(null);

  const stopWatching = useCallback(() => {
    if (browserWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(browserWatchIdRef.current);
      browserWatchIdRef.current = null;
    }
    if (tauriCleanupRef.current) {
      tauriCleanupRef.current();
      tauriCleanupRef.current = null;
    }
    setWatching(false);
  }, []);

  const startWatching = useCallback(async () => {
    if (watching) return;

    // Try Tauri geolocation plugin first (works on Android where it's registered).
    // If the plugin isn't available (desktop), fall back to browser Geolocation API.
    try {
      const geo = await import("@tauri-apps/plugin-geolocation");

      let perm = await geo.checkPermissions();
      if (perm.location !== "granted") {
        perm = await geo.requestPermissions(["location"]);
      }
      if (perm.location === "denied") {
        setPermissionDenied(true);
        return;
      }

      const callbackId = await geo.watchPosition(
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        (pos, err) => {
          if (err) return;
          if (pos) {
            setLocation({
              latitude_deg: pos.coords.latitude,
              longitude_deg: pos.coords.longitude,
              accuracy_m: pos.coords.accuracy,
            });
          }
        },
      );

      tauriCleanupRef.current = () => {
        geo.clearWatch(callbackId);
      };
      setWatching(true);
      return;
    } catch {
      // Plugin not registered (desktop) — fall through to browser API
    }

    // Browser Geolocation API fallback
    const watchId = startBrowserWatch(setLocation, setPermissionDenied, setSupported);
    if (watchId === null) {
      setSupported(false);
      return;
    }
    browserWatchIdRef.current = watchId;
    setWatching(true);
  }, [watching]);

  useEffect(() => stopWatching, [stopWatching]);

  return { location, supported, permissionDenied, watching, startWatching, stopWatching };
}
