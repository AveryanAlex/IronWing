<script lang="ts">
import type { MissionPlannerMode } from "../../lib/stores/mission-planner";
import type { MissionPlannerView } from "../../lib/stores/mission-planner-view";
import { modeShellBody, modeShellTitle } from "./mission-workspace-helpers";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  mode: MissionPlannerMode;
  view: MissionPlannerView;
};

let { mode, view }: Props = $props();
</script>

<section
  class="rounded-lg border border-border bg-bg-primary p-5"
  data-testid={missionWorkspaceTestIds.modeShell}
>
  <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">{mode} mode</p>
  <h3 class="mt-2 text-lg font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.modeShellTitle}>{modeShellTitle(mode)}</h3>
  <p class="mt-2 text-sm text-text-secondary" data-testid={missionWorkspaceTestIds.modeShellBody}>{modeShellBody(mode, view)}</p>
</section>
