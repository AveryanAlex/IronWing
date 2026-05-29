<script lang="ts">
import type { Snippet } from "svelte";

import { HelperText, StagedBadge as SetupStagedBadge } from "../../../components/ui";

type ControlWidth = "narrow" | "default" | "wide";
type Align = "center" | "start";

type Props = {
  id: string;
  label: string;
  description?: string;
  labelTestId?: string;
  stagedName?: string;
  stagedTestId?: string;
  onUnstage?: (name: string) => void;
  controlWidth?: ControlWidth;
  align?: Align;
  children: Snippet;
};

const controlWidthClasses: Record<ControlWidth, string> = {
  narrow: "xl:grid-cols-[minmax(0,1fr)_minmax(10rem,16rem)]",
  default: "xl:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)]",
  wide: "xl:grid-cols-[minmax(0,1fr)_minmax(16rem,28rem)]",
};

const alignClasses: Record<Align, string> = {
  center: "xl:items-center",
  start: "xl:items-start",
};

let {
  id,
  label,
  description,
  labelTestId,
  stagedName,
  stagedTestId,
  onUnstage,
  controlWidth = "default",
  align = "center",
  children,
}: Props = $props();

let rowClass = $derived(`grid gap-3 pt-3 first:pt-0 ${controlWidthClasses[controlWidth]} ${alignClasses[align]}`);
</script>

<div class={rowClass}>
  <div>
    <div class="flex flex-wrap items-center gap-2">
      <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for={id} data-testid={labelTestId}>
        {label}
      </label>
      {#if stagedName}
        <SetupStagedBadge name={stagedName} onUnstage={onUnstage} testId={stagedTestId} />
      {/if}
    </div>

    {#if description}
      <HelperText class="mt-2">{description}</HelperText>
    {/if}
  </div>

  <div>
    {@render children()}
  </div>
</div>
