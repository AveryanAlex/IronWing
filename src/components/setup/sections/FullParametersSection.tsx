import { ConfigPanel } from "../../ConfigPanel";
import type { useParams } from "../../../hooks/use-params";

type FullParametersSectionProps = {
  params: ReturnType<typeof useParams>;
  connected: boolean;
};

// ConfigPanel has its own staged-diff + apply/discard — shell should hide its StagedParamsBar
export const HIDES_SHELL_STAGED_BAR = true;

export function FullParametersSection({ params, connected }: FullParametersSectionProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden p-3">
      <ConfigPanel params={params} connected={connected} />
    </div>
  );
}
