<script lang="ts">
import { Button } from "../../../components/ui";
import type { ParameterItemModel } from "../../../lib/params/parameter-item-model";
import SetupParamEditCard from "./SetupParamEditCard.svelte";

type Props = {
  item: ParameterItemModel;
  inputId?: string;
  label?: string;
  description?: string | null;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string | null;
  invalid?: boolean;
  disabled?: boolean;
  captureDisabled?: boolean;
  stagedName?: string;
  testId?: string;
  inputTestId?: string;
  captureTestId?: string;
  onValueChange: (value: number) => void;
  onCaptureLive: () => void;
};

let {
  item,
  inputId,
  label,
  description,
  value,
  min,
  max,
  step,
  unit = "µs",
  invalid = false,
  disabled = false,
  captureDisabled = false,
  stagedName,
  testId,
  inputTestId,
  captureTestId,
  onValueChange,
  onCaptureLive,
}: Props = $props();
</script>

{#snippet captureAction()}
  <Button
    size="default"
    tone="neutral"
    variant="outline"
    disabled={disabled || item.readOnly || captureDisabled}
    onclick={onCaptureLive}
    testId={captureTestId}
  >
    Capture live
  </Button>
{/snippet}

<SetupParamEditCard
  {item}
  {inputId}
  {label}
  {description}
  type="number"
  {value}
  {min}
  {max}
  {step}
  {unit}
  {invalid}
  {disabled}
  {stagedName}
  {testId}
  {inputTestId}
  onValueChange={(nextValue) => typeof nextValue === "number" && onValueChange(nextValue)}
  trailingAction={captureAction}
/>
