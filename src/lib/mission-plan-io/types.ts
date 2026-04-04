import type { GeoPoint2d, HomePosition, MissionItem, MissionPlan, RallyPlan, FencePlan } from "../mavkit-types";
import type { CatalogCamera } from "../survey-camera-catalog";
import type { SurveyPatternType, SurveyRegionParams } from "../survey-region";

export type ExportDomain = "mission" | "fence" | "rally";

export type ParsedSurveyRegion = {
    patternType: SurveyPatternType;
    position: number;
    polygon: GeoPoint2d[];
    polyline: GeoPoint2d[];
    camera: Partial<CatalogCamera> | null;
    params: Partial<SurveyRegionParams>;
    embeddedItems: MissionItem[];
    qgcPassthrough: Record<string, unknown>;
    warnings: string[];
};

export type ExportableSurveyRegion = {
    patternType: SurveyPatternType;
    polygon: GeoPoint2d[];
    polyline: GeoPoint2d[];
    camera: CatalogCamera | null;
    params: Partial<SurveyRegionParams>;
    embeddedItems: MissionItem[];
    qgcPassthrough: Record<string, unknown>;
    position: number;
};

export type ExportPlanInput = {
    mission: MissionPlan;
    surveyRegions?: ExportableSurveyRegion[];
    home: HomePosition | null;
    fence: FencePlan;
    rally: RallyPlan;
    cruiseSpeed?: number;
    hoverSpeed?: number;
    /** Domains listed here are omitted from the exported JSON. "mission" exclusion removes waypoints but the mission envelope is still written. */
    excludeDomains?: ExportDomain[];
};
