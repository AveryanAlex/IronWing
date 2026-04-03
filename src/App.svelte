<svelte:head>
  <title>IronWing</title>
</svelte:head>

<script lang="ts">
  const bootedAt = new Date().toISOString();
</script>

<main class="min-h-screen bg-bg-primary text-text-primary">
  <section class="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-4 px-6 py-16">
    <p class="text-sm uppercase tracking-[0.3em] text-text-secondary">IronWing</p>
    <h1 class="text-4xl font-semibold tracking-tight text-text-primary">Svelte runtime online</h1>
    <p class="max-w-2xl text-base leading-7 text-text-secondary">
      The active frontend boot path now mounts a minimal Svelte shell. The quarantined React runtime is no
      longer part of the shipped entrypoint.
    </p>

    <dl class="grid gap-3 rounded-2xl border border-border bg-surface/60 p-5 shadow-lg shadow-black/10 sm:grid-cols-2">
      <div>
        <dt class="text-xs uppercase tracking-[0.2em] text-text-secondary">Runtime</dt>
        <dd class="mt-1 text-lg font-medium text-text-primary">Svelte 5</dd>
      </div>
      <div>
        <dt class="text-xs uppercase tracking-[0.2em] text-text-secondary">Boot time</dt>
        <dd class="mt-1 text-lg font-medium text-text-primary">{bootedAt}</dd>
      </div>
    </dl>
  </section>
</main>
