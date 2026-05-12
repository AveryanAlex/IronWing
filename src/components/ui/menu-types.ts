export type MenuItem = {
  id: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  testId?: string;
  onSelect: () => void;
};
