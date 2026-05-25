import type { FencePlan } from "../../fence";
import type { HomePosition, MissionPlan } from "../../mission";
import type { RallyPlan } from "../../rally";
import {
  toExportableSurveyRegion,
  type SurveyDraftExtension,
} from "../survey-region";

export function sameHome(left: HomePosition | null, right: HomePosition | null): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

  return left.latitude_deg === right.latitude_deg
    && left.longitude_deg === right.longitude_deg
    && left.altitude_m === right.altitude_m;
}

export function sameSurvey(left: SurveyDraftExtension, right: SurveyDraftExtension): boolean {
  return JSON.stringify(serializeSurvey(left)) === JSON.stringify(serializeSurvey(right));
}

export function samePlan(left: MissionPlan, right: MissionPlan): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function sameFence(left: FencePlan, right: FencePlan): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function sameRally(left: RallyPlan, right: RallyPlan): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function serializeSurvey(extension: SurveyDraftExtension) {
  return extension.surveyRegionOrder
    .map((block, index) => ({ block, index }))
    .sort((left, right) => left.block.position - right.block.position || left.index - right.index)
    .map(({ block }) => {
      const region = extension.surveyRegions.get(block.regionId);
      let exportable: ReturnType<typeof toExportableSurveyRegion> | null = null;
      let exportError: string | null = null;

      if (region) {
        try {
          exportable = toExportableSurveyRegion(region, block.position);
        } catch (error) {
          exportError = error instanceof Error ? error.message : String(error);
        }
      }

      return {
        position: block.position,
        regionId: block.regionId,
        importWarnings: region?.importWarnings ?? [],
        generationState: region?.generationState ?? "idle",
        generationMessage: region?.generationMessage ?? null,
        exportable,
        exportError,
      };
    });
}
