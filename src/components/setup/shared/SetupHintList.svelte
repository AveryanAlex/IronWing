<script lang="ts">
import { Lightbulb } from "lucide-svelte";
import type { Snippet, SvelteComponent } from "svelte";

type IconComponent = new (...args: any[]) => SvelteComponent;

import SetupCard from "./SetupCard.svelte";
import SetupCardHeader from "./SetupCardHeader.svelte";

type Props = {
  icon?: IconComponent;
  title: string;
  children: Snippet;
};

let { icon = Lightbulb, title, children }: Props = $props();
</script>

<SetupCard>
  <SetupCardHeader {icon} {title} />
  <div class="flex flex-col gap-2.5">
    {@render children()}
  </div>
</SetupCard>
