<script lang="ts">
  async function loadStatus() {
    return "async-ready";
  }
</script>

<svelte:boundary>
  <p data-testid="async-canary">{await loadStatus()}</p>

  {#snippet pending()}
    <p data-testid="async-pending">pending</p>
  {/snippet}
</svelte:boundary>
