<script lang="ts">
import { detectBooleanEnumOptions } from "../../../lib/params/boolean-enum";
import {
  Field,
  Eyebrow,
  NativeSelect,
  ParameterBooleanSwitch,
  RebootRequiredBadge,
  StagedBadge as SetupStagedBadge,
} from "../../../components/ui";

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

let booleanOptions = $derived(detectBooleanEnumOptions(options));
let nativeOptions = $derived(options.map((option) => ({ value: String(option.code), label: option.label })));
</script>

{#snippet badges()}
  {#if stagedName && onUnstage}
    <SetupStagedBadge name={stagedName} onUnstage={onUnstage} testId={stagedTestId} />
  {/if}
  {#if rebootRequired}
    <RebootRequiredBadge testId={rebootTestId} />
  {/if}
{/snippet}

{#snippet selectControl(className?: string)}
  <NativeSelect
    {id}
    class={className}
    {disabled}
    options={nativeOptions}
    onchange={(event) => onChange((event.currentTarget as HTMLSelectElement).value)}
    size={compact ? "sm" : "default"}
    {testId}
    {value}
  />
{/snippet}

{#snippet paramControl(className?: string)}
  {#if booleanOptions}
    <ParameterBooleanSwitch
      checked={Number(value) === booleanOptions.on.code}
      {disabled}
      {id}
      offLabel={booleanOptions.off.label}
      onLabel={booleanOptions.on.label}
      onToggle={(checked) => onChange(String(checked ? booleanOptions.on.code : booleanOptions.off.code))}
      testId={testId}
    />
  {:else}
    {@render selectControl(className)}
  {/if}
{/snippet}

<Field.Root>
  {#if label}
    <div class="flex flex-wrap items-center gap-2">
      <Field.Label for={id}><Eyebrow as="span" tracking="widest">{label}</Eyebrow></Field.Label>
      {@render badges()}
    </div>
  {/if}

  {#if compact && !label}
    <div class="flex min-w-0 items-center gap-2">
      <div class="min-w-0 flex-1">
        {@render paramControl()}
      </div>
      {@render badges()}
    </div>
  {:else}
    {@render paramControl()}
  {/if}

  {#if !compact && !label && ((stagedName && onUnstage) || rebootRequired)}
    <p class="mt-2 flex flex-wrap gap-2">
      {@render badges()}
    </p>
  {/if}
  {#if description}
    <Field.Description class="text-xs leading-relaxed text-text-muted">{description}</Field.Description>
  {/if}
</Field.Root>
