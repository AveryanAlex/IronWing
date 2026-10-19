type Unlisten = () => void;
type Subscribe = () => Promise<Unlisten>;

/** Subscribe concurrently, releasing both ready and late listeners if any subscription fails. */
export async function subscribeListenerGroup(subscribers: readonly Subscribe[]): Promise<Unlisten> {
  let active = true;
  const disposers: Unlisten[] = [];
  const dispose = () => {
    active = false;
    for (const stop of disposers.splice(0)) stop();
  };

  try {
    await Promise.all(subscribers.map(async (subscribe) => {
      const stop = await subscribe();
      if (active) disposers.push(stop);
      else stop();
    }));
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
