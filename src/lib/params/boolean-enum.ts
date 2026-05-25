export type BooleanEnumOption = {
  code: number;
  label: string;
};

export type BooleanEnumDescriptor = {
  off: BooleanEnumOption;
  on: BooleanEnumOption;
};

const OFF_LABEL_PATTERN = /^(disabled?|off|no|false)(?:\b|$)/i;
const ON_LABEL_PATTERN = /^(enabled?|on|yes|true)(?:\b|$)/i;

export function detectBooleanEnumOptions(
  options: ReadonlyArray<BooleanEnumOption> | undefined,
): BooleanEnumDescriptor | null {
  if (!Array.isArray(options) || options.length !== 2) {
    return null;
  }

  const off = options.find((option) => option.code === 0);
  const on = options.find((option) => option.code === 1);
  if (!off || !on) {
    return null;
  }

  if (!OFF_LABEL_PATTERN.test(off.label.trim()) || !ON_LABEL_PATTERN.test(on.label.trim())) {
    return null;
  }

  return { off, on };
}
