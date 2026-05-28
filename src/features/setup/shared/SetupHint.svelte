<script lang="ts">
import { Info } from "lucide-svelte";
import type { Snippet, SvelteComponent } from "svelte";
import { Alert } from "../../../components/ui";

type IconComponent = new (...args: any[]) => SvelteComponent;

type Props = {
  icon?: IconComponent;
  children: Snippet;
};

let { icon: Icon = Info, children }: Props = $props();
</script>

{#snippet hintIcon()}
  <Icon size={14} class="mt-0.5 shrink-0" aria-hidden="true" />
{/snippet}

<Alert variant="info" icon={hintIcon} density="compact" shadow={false}>
  <div class="text-xs leading-relaxed">{@render children()}</div>
</Alert>
