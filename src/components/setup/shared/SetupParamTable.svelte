<script lang="ts">
import type { Snippet } from "svelte";

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
            class={[
              "pb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted",
              index === 0 ? "pl-4 pr-3" : index === columns.length - 1 ? "pl-2 pr-4" : "px-2",
            ].join(" ")}
          >
            {column}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody class="[&_tr:first-child_td]:pt-3 [&_tr:last-child_td]:pb-0">
      {@render children()}
    </tbody>
  </table>
</div>
