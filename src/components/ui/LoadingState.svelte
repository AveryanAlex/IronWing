<script lang="ts">
import Spinner from "./Spinner.svelte";
import { cn } from "../../lib/utils";

type Props = { label?: string; class?: string; testId?: string };

let { label = "Loading...", class: className, testId }: Props = $props();
</script>

<div
  class={cn("inline-flex items-center gap-2 text-sm text-text-secondary", className)}
  role="status"
  aria-live="polite"
  data-testid={testId}
>
  <Spinner size="sm" decorative />
  <span>{label}</span>
</div>
