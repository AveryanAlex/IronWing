<script lang="ts">
import type { Snippet } from "svelte";
import { Panel, SectionHeader, Banner } from "../ui";

type Severity = "info" | "warning" | "danger" | "blocking" | "success";

type StatusBanner = {
  severity: Severity;
  title: string;
  message?: string;
};

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  status?: StatusBanner;
  testId?: string;
  body: Snippet;
  actions?: Snippet;
};

let { eyebrow, title, description, status, testId, body, actions }: Props = $props();
</script>

<section class="setup-section" data-testid={testId}>
  <SectionHeader {eyebrow} {title} {description} {actions} />
  {#if status}
    <Banner severity={status.severity} title={status.title} message={status.message} />
  {/if}
  <Panel>
    <div class="setup-section__body">{@render body()}</div>
  </Panel>
</section>

<style>
.setup-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
}
.setup-section__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
@media (max-width: 767px) {
  .setup-section {
    padding: var(--space-3);
    gap: var(--space-3);
  }
}
</style>
