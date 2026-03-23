import { Sliders } from "lucide-react";
import { ConfigPanel } from "../../ConfigPanel";
import { SetupSectionIntro } from "../shared/SetupSectionIntro";
import type { ParamsState } from "../../../hooks/use-params";

type FullParametersSectionProps = {
  params: ParamsState;
  connected: boolean;
  highlightParam?: string | null;
  onHighlightHandled?: () => void;
};

export function FullParametersSection({ params, connected, highlightParam, onHighlightHandled }: FullParametersSectionProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-3 pt-3">
        <SetupSectionIntro
          icon={Sliders}
          title="Full Parameters"
          description="Browse, search, and edit every vehicle parameter. Changes are staged locally until you apply them. The shell tray below tracks all pending changes across sections."
        />
      </div>
      <div className="flex-1 overflow-hidden px-3 pb-3 pt-2">
        <ConfigPanel params={params} connected={connected} highlightParam={highlightParam} onHighlightHandled={onHighlightHandled} />
      </div>
    </div>
  );
}
