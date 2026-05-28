<script lang="ts">
import type { Snippet } from "svelte";

type Props = {
  children: Snippet;
};

let { children }: Props = $props();
</script>

<div class="flex flex-col gap-3">
  {@render children()}
</div>
