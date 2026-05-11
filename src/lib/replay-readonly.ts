export const REPLAY_READONLY_TITLE = "Replay is read-only";

export const REPLAY_READONLY_COPY = "Live vehicle write commands stay blocked while replay is active. Return to the live session to edit parameters or send vehicle commands.";

export function isReplayReadonly(sourceKind: "live" | "playback" | null | undefined): boolean {
  return sourceKind === "playback";
}
