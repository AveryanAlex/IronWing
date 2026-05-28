<script lang="ts">
import { AlertTriangle, CheckCircle2, Info } from "lucide-svelte";
import type { Snippet, SvelteComponent } from "svelte";
import { Alert } from "../../../components/ui";

type IconComponent = new (...args: any[]) => SvelteComponent;

type Tone = "info" | "warning" | "danger" | "success";

type Props = {
  tone?: Tone;
  icon?: IconComponent;
  testId?: string;
  children: Snippet;
};

const defaultIcons: Record<Tone, IconComponent> = {
  info: Info,
  warning: AlertTriangle,
  danger: AlertTriangle,
  success: CheckCircle2,
};

let { tone = "info", icon, testId, children }: Props = $props();

let Icon = $derived(icon ?? defaultIcons[tone]);
</script>

{#snippet noticeIcon()}
  <Icon size={14} class="mt-0.5 shrink-0" aria-hidden="true" />
{/snippet}

<Alert variant={tone} icon={noticeIcon} density="compact" appearance="solid" layout="row" shadow={false} {testId}>
  <div class="text-xs leading-relaxed">{@render children()}</div>
</Alert>
