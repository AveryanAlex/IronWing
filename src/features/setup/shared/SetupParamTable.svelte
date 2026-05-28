<script lang="ts">
import type { Snippet } from "svelte";
import { Eyebrow } from "../../../components/ui";

type Props = {
  columns: string[];
  children: Snippet;
};

let { columns, children }: Props = $props();
</script>

<div class="-mx-4 overflow-x-auto">
  <table class="w-full min-w-[560px] text-left">
    <thead>
      <tr class="border-b border-border">
        {#each columns as column, index (column)}
          <th
            class={index === 0 ? "pb-2 pl-4 pr-3" : index === columns.length - 1 ? "pb-2 pl-2 pr-4" : "px-2 pb-2"}
          >
            <Eyebrow as="span">{column}</Eyebrow>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody class="[&_tr:first-child_td]:pt-3 [&_tr:last-child_td]:pb-0">
      {@render children()}
    </tbody>
  </table>
</div>
