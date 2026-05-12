export type MenuItem = {
  id: string;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};
