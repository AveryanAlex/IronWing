<script lang="ts">
let {
  label = "reboot",
  testId,
}: {
  label?: string;
  testId?: string;
} = $props();
</script>

<span
  aria-label="Reboot required after change"
  class="inline-flex items-center rounded bg-danger/10 px-1.5 py-0.5 text-xs font-semibold lowercase text-danger"
  data-testid={testId}
  title="Reboot required after change"
>
  {label}
</span>
