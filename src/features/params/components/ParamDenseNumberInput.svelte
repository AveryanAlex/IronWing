<script lang="ts">
import type { HTMLInputAttributes } from "svelte/elements";

import { Input } from "../../../components/ui";

type Props = Omit<HTMLInputAttributes, "class" | "size" | "type" | "value"> & {
  value?: HTMLInputAttributes["value"];
  invalid?: boolean;
  testId?: string;
};

let { value = $bindable(), invalid = false, testId, ...rest }: Props = $props();
</script>

<Input
  {...rest}
  bind:value
  class="h-7 rounded-sm px-2 text-[0.84rem] font-normal tabular-nums shadow-none"
  {invalid}
  size="sm"
  testId={testId}
  type="number"
/>
