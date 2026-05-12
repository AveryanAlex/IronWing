import type { Snippet } from "svelte";

export type MenuItem = {
  id: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  testId?: string;
  icon?: Snippet;
  onSelect: () => void;
};
