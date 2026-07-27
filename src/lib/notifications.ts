import { toast, type ExternalToast } from "svelte-sonner";

import { formatUnknownError } from "./error-format";

const DEFAULT_DURATION_MS = {
  error: 10_000,
  info: 6_000,
  success: 4_000,
  warning: 8_000,
} as const;

export type NotificationOptions = ExternalToast;

function withDefaultDuration(
  options: NotificationOptions,
  duration: number,
): NotificationOptions {
  return {
    duration,
    ...options,
  };
}

export function notifySuccess(
  title: string,
  options: NotificationOptions = {},
): string | number {
  return toast.success(
    title,
    withDefaultDuration(options, DEFAULT_DURATION_MS.success),
  );
}

export function notifyInfo(
  title: string,
  options: NotificationOptions = {},
): string | number {
  return toast.info(
    title,
    withDefaultDuration(options, DEFAULT_DURATION_MS.info),
  );
}

export function notifyWarning(
  title: string,
  options: NotificationOptions = {},
): string | number {
  return toast.warning(
    title,
    withDefaultDuration(options, DEFAULT_DURATION_MS.warning),
  );
}

export function notifyError(
  title: string,
  options: NotificationOptions = {},
): string | number {
  return toast.error(
    title,
    withDefaultDuration(options, DEFAULT_DURATION_MS.error),
  );
}

export function notifyUnknownError(
  title: string,
  error: unknown,
  options: NotificationOptions = {},
): string | number {
  return notifyError(title, {
    description: formatUnknownError(error),
    ...options,
  });
}

export function dismissNotification(id?: string | number): void {
  toast.dismiss(id);
}
