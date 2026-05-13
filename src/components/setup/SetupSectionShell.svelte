<script lang="ts">
import type { Snippet } from "svelte";
import { Panel, SectionHeader, Banner } from "../ui";
import type { SetupSectionId } from "../../lib/setup-sections";
import SetupSectionIcon from "./SetupSectionIcon.svelte";

type Severity = "info" | "warning" | "danger" | "blocking" | "success";

type StatusBanner = {
  severity: Severity;
  title: string;
  message?: string;
};

type Props = {
  eyebrow?: string;
  title: string;
  sectionId?: SetupSectionId;
  description?: string;
  status?: StatusBanner;
  testId?: string;
  body: Snippet;
  actions?: Snippet;
};

let { eyebrow, title, sectionId, description, status, testId, body, actions }: Props = $props();
</script>

{#snippet sectionIcon()}
  {#if sectionId}
    <SetupSectionIcon {sectionId} size={16} />
  {/if}
{/snippet}

<section class="flex flex-col gap-3 p-3 md:gap-4 md:p-5" data-testid={testId}>
  <SectionHeader {eyebrow} {title} {description} icon={sectionId ? sectionIcon : undefined} {actions} />
  {#if status}
    <Banner severity={status.severity} title={status.title} message={status.message} />
  {/if}
  <Panel>
    <div class="flex flex-col gap-3">{@render body()}</div>
  </Panel>
</section>
