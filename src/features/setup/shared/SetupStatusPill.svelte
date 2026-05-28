<script lang="ts">
import type { Snippet } from "svelte";
import { Badge } from "../../../components/ui";

type Tone = "accent" | "muted" | "success" | "warning" | "danger";

type Props = {
  tone?: Tone;
  testId?: string;
  children: Snippet;
};

const toneVariants: Record<Tone, "accent" | "muted" | "success" | "warning" | "destructive"> = {
  accent: "accent",
  muted: "muted",
  success: "success",
  warning: "warning",
  danger: "destructive",
};

let { tone = "accent", testId, children }: Props = $props();
</script>

<Badge variant={toneVariants[tone]} size="sm" case="normal" shape="pill" {testId}>{@render children()}</Badge>
