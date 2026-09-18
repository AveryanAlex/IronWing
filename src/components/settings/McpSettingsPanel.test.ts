// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";
import McpSettingsPanel from "./McpSettingsPanel.svelte";
import type { McpSettingsService } from "../../lib/platform/mcp";

const initial = {
  settings: { enabled: false, host: "127.0.0.1", port: 14243, token: null },
  status: { supported: true, running: false, endpoint: null, last_error: null },
};
function service(): McpSettingsService {
  return { read: vi.fn().mockResolvedValue(initial), write: vi.fn().mockResolvedValue(initial), generateToken: vi.fn().mockResolvedValue("generated-token") };
}
afterEach(cleanup);
describe("MCP settings panel", () => {
  it("saves a typed configuration through the service", async () => {
    const api = service();
    const view = render(McpSettingsPanel, { service: api });
    const apply = await view.findByRole("button", { name: "Apply MCP settings" });
    await waitFor(() => expect((apply as HTMLButtonElement).disabled).toBe(false));
    await fireEvent.input(view.getByLabelText("Port"), { target: { value: "14300" } });
    await fireEvent.click(apply);
    expect(api.write).toHaveBeenCalledWith({ ...initial.settings, port: 14300 });
  });
  it("displays a failed bind while keeping the proposed address editable", async () => {
    const api = service(); vi.mocked(api.write).mockRejectedValue(new Error("Address already in use"));
    const view = render(McpSettingsPanel, { service: api });
    const apply = await view.findByRole("button", { name: "Apply MCP settings" });
    await waitFor(() => expect((apply as HTMLButtonElement).disabled).toBe(false));
    await fireEvent.click(apply);
    expect((await view.findByRole("alert")).textContent).toContain("Address already in use");
  });
  it("shows desktop-only availability on the web", async () => {
    const api = service();vi.mocked(api.read).mockResolvedValue({ ...initial, status: { ...initial.status, supported: false } });
    const view = render(McpSettingsPanel, { service: api });
    await view.findByText("The MCP server is available in the desktop application.");
    expect(view.queryByRole("button", { name: "Apply MCP settings" })).toBeNull();
  });
});
