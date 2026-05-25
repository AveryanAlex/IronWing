<script lang="ts">
import type { Snippet } from "svelte";
import { Banner } from "../ui";
import type { SetupSectionId } from "../../lib/setup-sections";
import SetupContentPanel from "./shared/SetupContentPanel.svelte";
import SetupIntroCard from "./shared/SetupIntroCard.svelte";

type Severity = "info" | "warning" | "danger" | "blocking" | "success";

type StatusBanner = {
  severity: Severity;
  title: string;
  message?: string;
};

type SetupDocLink = {
  url: string | null | undefined;
  label?: string;
  testId?: string;
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
  docs?: SetupDocLink[];
};

let { eyebrow, title, sectionId, description, status, testId, body, actions, docs = [] }: Props = $props();

let introTitle = $derived(eyebrow ?? title);
</script>

<section class="flex flex-col gap-3 md:gap-4" data-testid={testId}>
  <SetupIntroCard {sectionId} title={introTitle} {description} {actions} {docs} />
  {#if status}
    <Banner severity={status.severity} title={status.title} message={status.message} />
  {/if}
  <SetupContentPanel>{@render body()}</SetupContentPanel>
</section>
