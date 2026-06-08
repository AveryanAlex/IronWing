import type { ArgCommandName, InvokeArg, InvokeCommandMap, InvokeResult, NoArgCommandName } from "./command-types";

export type PlatformCommandHandler<C extends keyof InvokeCommandMap> = InvokeCommandMap[C]["args"] extends undefined
  ? () => Promise<InvokeResult<C>> | InvokeResult<C>
  : (args: InvokeCommandMap[C]["args"]) => Promise<InvokeResult<C>> | InvokeResult<C>;

export type PlatformCommandHandlers = Partial<{
  [C in keyof InvokeCommandMap]: PlatformCommandHandler<C>;
}>;

export function definePlatformCommandHandlers<const H extends PlatformCommandHandlers>(handlers: H): H {
  return handlers;
}

export function invokePlatformCommand<C extends NoArgCommandName>(
  handlers: PlatformCommandHandlers,
  command: C,
): Promise<InvokeResult<C> | undefined>;
export function invokePlatformCommand<C extends ArgCommandName>(
  handlers: PlatformCommandHandlers,
  command: C,
  args: InvokeArg<C>,
): Promise<InvokeResult<C> | undefined>;
export async function invokePlatformCommand<C extends keyof InvokeCommandMap>(
  handlers: PlatformCommandHandlers,
  command: C,
  args?: InvokeCommandMap[C]["args"],
): Promise<InvokeResult<C> | undefined> {
  const handler = handlers[command] as PlatformCommandHandler<C> | undefined;
  if (!handler) {
    return undefined;
  }

  if (args === undefined) {
    return await (handler as () => Promise<InvokeResult<C>> | InvokeResult<C>)();
  }

  return await (handler as (args: InvokeCommandMap[C]["args"]) => Promise<InvokeResult<C>> | InvokeResult<C>)(args);
}
