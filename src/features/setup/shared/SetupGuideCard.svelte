<script lang="ts">
import { Lightbulb } from "lucide-svelte";
import type { Snippet, SvelteComponent } from "svelte";

import SetupSectionCard from "./SetupSectionCard.svelte";

type IconComponent = new (...args: any[]) => SvelteComponent;

type SetupDocLink = {
  url: string | null | undefined;
  label?: string;
  testId?: string;
};

type Props = {
  icon?: IconComponent;
  title: string;
  description?: string;
  docs?: SetupDocLink[];
  docsUrl?: string | null | undefined;
  docsLabel?: string;
  class?: string;
  testId?: string;
  actions?: Snippet;
  children: Snippet;
};

let {
  icon = Lightbulb,
  title,
  description,
  docs = [],
  docsUrl,
  docsLabel,
  class: className = "",
  testId,
  actions,
  children,
}: Props = $props();
</script>

<SetupSectionCard
  {icon}
  {title}
  {description}
  {docs}
  {docsUrl}
  {docsLabel}
  tone="info"
  surface="secondary"
  compact
  class={className}
  {testId}
  {actions}
>
  <div class="flex flex-col gap-2.5 text-sm leading-6 text-text-secondary">
    {@render children()}
  </div>
</SetupSectionCard>
