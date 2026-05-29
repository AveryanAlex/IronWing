<script lang="ts">
import SetupNotice from "./SetupNotice.svelte";

type NoticeTone = "info" | "warning" | "danger" | "success";
type NoticeItem = string | { id?: string | number; text: string; tone?: NoticeTone };

type Props = {
  notices: readonly NoticeItem[];
  tone?: NoticeTone;
  testIdPrefix?: string;
};

let { notices, tone = "warning", testIdPrefix }: Props = $props();

function noticeText(notice: NoticeItem): string {
  return typeof notice === "string" ? notice : notice.text;
}

function noticeTone(notice: NoticeItem): NoticeTone {
  return typeof notice === "string" ? tone : (notice.tone ?? tone);
}

function noticeId(notice: NoticeItem, index: number): string | number {
  return typeof notice === "string" ? index : (notice.id ?? index);
}
</script>

{#each notices as notice, index (noticeId(notice, index))}
  <SetupNotice tone={noticeTone(notice)} testId={testIdPrefix ? `${testIdPrefix}-${noticeId(notice, index)}` : undefined}>
    {noticeText(notice)}
  </SetupNotice>
{/each}
