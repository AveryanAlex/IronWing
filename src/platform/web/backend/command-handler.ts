export type WebCommandArgs = Record<string, unknown> | undefined;

export type WebCommandHandled = {
  handled: true;
  value: unknown;
};

export type WebCommandUnhandled = {
  handled: false;
};

export type WebCommandResult = WebCommandHandled | WebCommandUnhandled;

export type WebCommandHandler = (cmd: string, args?: WebCommandArgs) => Promise<WebCommandResult> | WebCommandResult;

export const WEB_COMMAND_UNHANDLED: WebCommandUnhandled = { handled: false };

export function handled(value: unknown): WebCommandHandled {
  return { handled: true, value };
}
