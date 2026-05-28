import type { Snippet } from "svelte";

export type ContextMenuSeparatorItem = {
  id: string;
  kind: "separator";
};

export type ContextMenuItem = {
  id: string;
  kind?: "item";
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  testId?: string;
  title?: string;
  icon?: Snippet;
  onSelect: () => void;
} | ContextMenuSeparatorItem;
