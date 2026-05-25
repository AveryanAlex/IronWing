<script lang="ts">
import RebootRequiredBadge from "../../ui/RebootRequiredBadge.svelte";
import SetupStagedBadge from "../../ui/StagedBadge.svelte";

type Option = {
  code: number;
  label: string;
};

type Props = {
  id: string;
  value: string;
  options: Option[];
  disabled?: boolean;
  compact?: boolean;
  label?: string;
  description?: string;
  testId?: string;
  stagedName?: string;
  stagedTestId?: string;
  rebootRequired?: boolean;
  rebootTestId?: string;
  onChange: (value: string) => void;
  onUnstage?: (name: string) => void;
};

let {
  id,
  value,
  options,
  disabled = false,
  compact = false,
  label,
  description,
  testId,
  stagedName,
  stagedTestId,
  rebootRequired = false,
  rebootTestId,
  onChange,
  onUnstage,
}: Props = $props();

let selectClass = $derived([
  "w-full rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary",
  compact ? "py-2" : "py-2",
].join(" "));
</script>

{#snippet badges()}
  {#if stagedName && onUnstage}
    <SetupStagedBadge name={stagedName} onUnstage={onUnstage} testId={stagedTestId} />
  {/if}
  {#if rebootRequired}
    <RebootRequiredBadge testId={rebootTestId} />
  {/if}
{/snippet}

{#snippet selectControl(className: string)}
  <select
    {id}
    class={className}
    data-testid={testId}
    {disabled}
    onchange={(event) => onChange((event.currentTarget as HTMLSelectElement).value)}
    {value}
  >
    {#each options as option (option.code)}
      <option value={String(option.code)}>{option.label}</option>
    {/each}
  </select>
{/snippet}

<div>
  {#if label}
    <div class="flex flex-wrap items-center gap-2">
      <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for={id}>{label}</label>
      {@render badges()}
    </div>
  {/if}

  {#if compact && !label}
    <div class="flex min-w-0 items-center gap-2">
      <div class="min-w-0 flex-1">
        {@render selectControl(selectClass)}
      </div>
      {@render badges()}
    </div>
  {:else}
    {@render selectControl(label ? `${selectClass} mt-2` : selectClass)}
  {/if}

  {#if !compact && !label && ((stagedName && onUnstage) || rebootRequired)}
    <p class="mt-2 flex flex-wrap gap-2">
      {@render badges()}
    </p>
  {/if}
  {#if description}
    <p class="mt-2 text-xs leading-relaxed text-text-muted">{description}</p>
  {/if}
</div>
