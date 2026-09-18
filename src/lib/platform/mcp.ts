import { typedInvoke } from "../ipc/client";
import type { McpSettings, McpSettingsResult } from "../generated/ironwing";

export type McpSettingsService = {
  read(): Promise<McpSettingsResult>;
  write(settings: McpSettings): Promise<McpSettingsResult>;
  generateToken(): Promise<string>;
};
export const mcpSettingsService: McpSettingsService = {
  read: () => typedInvoke("mcp_settings_read"),
  write: (settings) => typedInvoke("mcp_settings_write", { settings }),
  generateToken: () => typedInvoke("mcp_token_generate"),
};
