import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CalibrationDomain } from "../calibration";
import type { ConfigurationFactsDomain } from "../configuration-facts";
import type { SensorHealthDomain } from "../sensor-health";
import type { SupportDomain } from "../support";
import type { VehicleState } from "../telemetry";
import type { ParamsState } from "./use-params";
import { useSetupSections, type SetupSectionId, type SetupSectionsReturn } from "./use-setup-sections";

export type UseSetupReturn = SetupSectionsReturn & {
  params: ParamsState;
  paramsLoaded: boolean;
  setupReady: boolean;
  effectiveSection: SetupSectionId;
  pendingHighlightParam: string | null;
  navigateToParam: (paramName: string) => void;
  handleHighlightHandled: () => void;
};

export type UseSetupFacts = {
  support: SupportDomain | null;
  sensorHealth: SensorHealthDomain | null;
  configurationFacts: ConfigurationFactsDomain | null;
  calibration: CalibrationDomain | null;
};

export function useSetup(
  params: ParamsState,
  vehicleState: VehicleState | null,
  facts: UseSetupFacts,
  connected: boolean,
): UseSetupReturn {
  const setupSections = useSetupSections(vehicleState, facts);
  const { activeSection, setActiveSection } = setupSections;
  const [pendingHighlightParam, setPendingHighlightParam] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightedElementRef = useRef<Element | null>(null);

  const clearHighlight = useCallback(() => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    if (highlightedElementRef.current) {
      highlightedElementRef.current.classList.remove("setup-param-highlight");
      highlightedElementRef.current = null;
    }
  }, []);

  const paramsLoaded = params.store !== null;
  const setupReady = paramsLoaded && params.metadata !== null;

  useEffect(() => {
    if (connected && !setupReady && activeSection !== "overview") {
      setActiveSection("overview");
    }
  }, [activeSection, connected, setActiveSection, setupReady]);

  useEffect(() => {
    return () => {
      clearHighlight();
    };
  }, [clearHighlight]);

  const effectiveSection = useMemo<SetupSectionId>(
    () => (!setupReady ? "overview" : activeSection),
    [activeSection, setupReady],
  );

  const navigateToParam = useCallback(
    (paramName: string) => {
      clearHighlight();
      const el = document.querySelector(`[data-setup-param="${paramName}"]`);
      if (el) {
        setPendingHighlightParam(null);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("setup-param-highlight");
        highlightedElementRef.current = el;
        highlightTimerRef.current = setTimeout(() => {
          el.classList.remove("setup-param-highlight");
          highlightedElementRef.current = null;
          highlightTimerRef.current = null;
        }, 1500);
        return;
      }

      params.setFilterMode("all");
      params.setSearch(paramName);
      setPendingHighlightParam(paramName);
      setActiveSection("full_parameters");
    },
    [clearHighlight, params, setActiveSection],
  );

  const handleHighlightHandled = useCallback(() => {
    setPendingHighlightParam(null);
  }, []);

  return {
    ...setupSections,
    params,
    paramsLoaded,
    setupReady,
    effectiveSection,
    pendingHighlightParam,
    navigateToParam,
    handleHighlightHandled,
  };
}
