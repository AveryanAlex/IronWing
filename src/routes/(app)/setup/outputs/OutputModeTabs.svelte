<script lang="ts">
import { page } from "$app/state";

import { InternalLink } from "../../../../components/ui";

let activeMode = $derived(page.url.searchParams.get("mode") === "test" ? "test" : "assign");
</script>

<nav class="inline-flex w-full items-center gap-1 rounded-lg border border-border bg-bg-secondary p-1 sm:w-auto" aria-label="Output workspace mode">
  <InternalLink
    class={`min-w-0 flex-1 justify-center border-transparent px-3 sm:flex-none ${activeMode === "assign" ? "bg-bg-primary text-text-primary shadow-sm" : "bg-transparent text-text-secondary shadow-none"}`}
    href="/setup/outputs?mode=assign"
    variant="button"
    aria-current={activeMode === "assign" ? "page" : undefined}
    testId="setup-workspace-outputs-mode-assign"
  >
    Assignments
  </InternalLink>
  <InternalLink
    class={`min-w-0 flex-1 justify-center border-transparent px-3 sm:flex-none ${activeMode === "test" ? "bg-bg-primary text-text-primary shadow-sm" : "bg-transparent text-text-secondary shadow-none"}`}
    href="/setup/outputs?mode=test"
    variant="button"
    aria-current={activeMode === "test" ? "page" : undefined}
    testId="setup-workspace-outputs-mode-test"
  >
    Servo test
  </InternalLink>
</nav>
