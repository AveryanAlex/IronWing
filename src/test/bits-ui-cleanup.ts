const BITS_UI_BODY_SCROLL_CLEANUP_DELAY_MS = 24;
const TEST_ENVIRONMENT_TIMER_BUFFER_MS = 6;

/**
 * Bits UI restores body scroll-lock styles from a delayed teardown timer.
 * If jsdom is destroyed before that timer runs, Vitest can report an
 * unhandled `ReferenceError: document is not defined` after an otherwise
 * successful overlay test. Await this after Testing Library cleanup in tests
 * that open Bits UI menu/dialog/sheet surfaces.
 */
export function waitForBitsUiBodyScrollCleanup(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, BITS_UI_BODY_SCROLL_CLEANUP_DELAY_MS + TEST_ENVIRONMENT_TIMER_BUFFER_MS);
  });
}
