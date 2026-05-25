<script lang="ts">
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
  onChange,
  onUnstage,
}: Props = $props();

let selectClass = $derived([
  "w-full rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary",
  compact ? "py-2" : "py-2",
].join(" "));
</script>

<div>
  {#if label}
    <div class="flex flex-wrap items-center gap-2">
      <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for={id}>{label}</label>
      {#if stagedName && onUnstage}
        <SetupStagedBadge name={stagedName} onUnstage={onUnstage} testId={stagedTestId} />
      {/if}
    </div>
  {/if}
  <select
    {id}
    class={label ? `${selectClass} mt-2` : selectClass}
    data-testid={testId}
    {disabled}
    onchange={(event) => onChange((event.currentTarget as HTMLSelectElement).value)}
    {value}
  >
    {#each options as option (option.code)}
      <option value={String(option.code)}>{option.label}</option>
    {/each}
  </select>
  {#if !label && stagedName && onUnstage}
    <p class="mt-2">
      <SetupStagedBadge name={stagedName} onUnstage={onUnstage} testId={stagedTestId} />
    </p>
  {/if}
  {#if description}
    <p class="mt-2 text-xs leading-relaxed text-text-muted">{description}</p>
  {/if}
</div>
