import { definePlatformCommandHandlers } from "./command-handler";

export const mcpCommandHandlers = definePlatformCommandHandlers({
  mcp_settings_read: () => ({
    settings: { enabled: false, host: "127.0.0.1", port: 14243, token: null },
    status: { supported: false, running: false, endpoint: null, last_error: null },
  }),
  mcp_settings_write: () => { throw new Error("MCP server requires the desktop application."); },
});
