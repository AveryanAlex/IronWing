import { Sliders } from "lucide-react";
import { ConfigPanel } from "../../ConfigPanel";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";
import type { VehicleState } from "../../../telemetry";
import { SetupSectionIntro } from "../shared/SetupSectionIntro";
import { getVehicleSlug } from "../shared/vehicle-helpers";
import type { ParamsState } from "../../../hooks/use-params";

type FullParametersSectionProps = {
  params: ParamsState;
  connected: boolean;
  vehicleState?: VehicleState | null;
  highlightParam?: string | null;
  onHighlightHandled?: () => void;
};

export function FullParametersSection({
  params,
  connected,
  vehicleState,
  highlightParam,
  onHighlightHandled,
}: FullParametersSectionProps) {
  const docsUrl = resolveDocsUrl("full_parameter_list", getVehicleSlug(vehicleState ?? null));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-3 pt-3">
        <SetupSectionIntro
          icon={Sliders}
          title="Full Parameters"
          description="Browse, search, and edit every vehicle parameter. This advanced reference is best for experienced users or targeted fixes after using the guided setup sections. Changes are still staged locally until you apply them, and the shell tray below tracks pending edits across sections."
          docsUrl={docsUrl}
        />
      </div>
      <div className="flex-1 overflow-hidden px-3 pb-3 pt-2">
        <ConfigPanel params={params} connected={connected} highlightParam={highlightParam} onHighlightHandled={onHighlightHandled} />
      </div>
    </div>
  );
}
