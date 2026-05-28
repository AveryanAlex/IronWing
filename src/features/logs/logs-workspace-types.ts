export type LogsWorkspaceMapHandoff =
	| {
			kind: "path";
			entryId: string;
			startUsec: number | null;
			endUsec: number | null;
	  }
	| {
			kind: "replay_marker";
			entryId: string;
			cursorUsec: number | null;
	  };
