<script lang="ts">
import { Button } from "../../../components/ui";
import { cn } from "../../../lib/utils";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive" | "warning" | "link" | "soft" | "solid" | "bare";
type ButtonTone = "neutral" | "accent" | "success" | "warning" | "danger";
type ButtonShape = "default" | "pill";
type ButtonClickHandler = (event: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) => void;

type Props = {
  primaryLabel: string;
  primaryPendingLabel?: string;
  primaryPending?: boolean;
  primaryDisabled?: boolean;
  primaryTestId?: string;
  primaryVariant?: ButtonVariant;
  primaryTone?: ButtonTone;
  primaryShape?: ButtonShape;
  onPrimary?: ButtonClickHandler;
  secondaryLabel?: string;
  secondaryPendingLabel?: string;
  secondaryPending?: boolean;
  secondaryDisabled?: boolean;
  secondaryTestId?: string;
  secondaryVariant?: ButtonVariant;
  secondaryTone?: ButtonTone;
  secondaryShape?: ButtonShape;
  secondaryPosition?: "before" | "after";
  onSecondary?: ButtonClickHandler;
  class?: string;
};

let {
  primaryLabel,
  primaryPendingLabel = "Working…",
  primaryPending = false,
  primaryDisabled = false,
  primaryTestId,
  primaryVariant = "soft",
  primaryTone = "accent",
  primaryShape = "pill",
  onPrimary,
  secondaryLabel,
  secondaryPendingLabel = "Working…",
  secondaryPending = false,
  secondaryDisabled = false,
  secondaryTestId,
  secondaryVariant = "secondary",
  secondaryTone,
  secondaryShape = "default",
  secondaryPosition = "after",
  onSecondary,
  class: className,
}: Props = $props();

let primaryText = $derived(primaryPending ? primaryPendingLabel : primaryLabel);
let secondaryText = $derived(secondaryPending ? secondaryPendingLabel : secondaryLabel);
</script>

{#snippet primaryAction()}
  <Button
    shape={primaryShape}
    tone={primaryTone}
    variant={primaryVariant}
    testId={primaryTestId}
    disabled={primaryDisabled || primaryPending}
    onclick={onPrimary}
  >
    {primaryText}
  </Button>
{/snippet}

{#snippet secondaryAction()}
  {#if secondaryLabel}
    <Button
      shape={secondaryShape}
      tone={secondaryTone}
      variant={secondaryVariant}
      testId={secondaryTestId}
      disabled={secondaryDisabled || secondaryPending}
      onclick={onSecondary}
    >
      {secondaryText}
    </Button>
  {/if}
{/snippet}

<div class={cn("flex flex-wrap gap-2", className)}>
  {#if secondaryPosition === "before"}
    {@render secondaryAction()}
  {/if}

  {@render primaryAction()}

  {#if secondaryPosition === "after"}
    {@render secondaryAction()}
  {/if}
</div>
