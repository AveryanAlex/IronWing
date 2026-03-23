export function attachAsyncListener(
  subscribe: () => Promise<() => void>,
): () => void {
  let active = true;
  let stop: (() => void) | null = null;

  subscribe().then((unlisten) => {
    if (!active) {
      unlisten();
      return;
    }

    stop = unlisten;
  });

  return () => {
    active = false;
    stop?.();
    stop = null;
  };
}
