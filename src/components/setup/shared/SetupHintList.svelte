<script lang="ts">
import type { Snippet, SvelteComponent } from "svelte";

type IconComponent = new (...args: any[]) => SvelteComponent;

import SetupCard from "./SetupCard.svelte";
import SetupCardHeader from "./SetupCardHeader.svelte";

type Props = {
  icon?: IconComponent;
  title: string;
  class?: string;
  children: Snippet;
};

let { icon, title, class: className = "", children }: Props = $props();
</script>

<SetupCard class={className}>
  <SetupCardHeader {icon} {title} />
  <div class="flex flex-col gap-2.5">
    {@render children()}
  </div>
</SetupCard>
