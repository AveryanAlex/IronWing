<script lang="ts">
import { AlertTriangle, CheckCircle2, Info } from "lucide-svelte";
import type { Snippet, SvelteComponent } from "svelte";

type IconComponent = new (...args: any[]) => SvelteComponent;

type Tone = "info" | "warning" | "danger" | "success";

type Props = {
  tone?: Tone;
  icon?: IconComponent;
  testId?: string;
  children: Snippet;
};

const toneClasses: Record<Tone, string> = {
  info: "border-border bg-bg-secondary/50 text-text-secondary",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  success: "border-success/30 bg-success/10 text-success",
};

const defaultIcons: Record<Tone, IconComponent> = {
  info: Info,
  warning: AlertTriangle,
  danger: AlertTriangle,
  success: CheckCircle2,
};

let { tone = "info", icon, testId, children }: Props = $props();

let Icon = $derived(icon ?? defaultIcons[tone]);
let noticeClass = $derived([
  "flex items-start gap-2 rounded-md border px-3 py-2.5",
  toneClasses[tone],
].join(" "));
</script>

<div class={noticeClass} data-tone={tone} data-testid={testId}>
  <Icon size={14} class="mt-0.5 shrink-0" aria-hidden="true" />
  <div class="text-xs leading-relaxed">{@render children()}</div>
</div>
