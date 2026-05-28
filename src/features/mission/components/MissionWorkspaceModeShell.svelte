<script lang="ts">
import type { MissionPlannerMode } from "../../../lib/stores/mission-planner";
import type { MissionPlannerView } from "../../../lib/stores/mission-planner-view";
import { Card, Eyebrow, HelperText } from "../../../components/ui";
import { modeShellBody, modeShellTitle } from "../mission-workspace-helpers";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

type Props = {
  mode: MissionPlannerMode;
  view: MissionPlannerView;
};

let { mode, view }: Props = $props();
</script>

<Card.Root
  as="section"
  density="comfortable"
  surface="primary"
  testId={missionWorkspaceTestIds.modeShell}
>
  <Eyebrow>{mode} mode</Eyebrow>
  <h3 class="mt-2 text-lg font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.modeShellTitle}>{modeShellTitle(mode)}</h3>
  <HelperText class="mt-2" testId={missionWorkspaceTestIds.modeShellBody}>{modeShellBody(mode, view)}</HelperText>
</Card.Root>
