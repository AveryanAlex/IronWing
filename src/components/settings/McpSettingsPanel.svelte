<script lang="ts">
import { onMount } from "svelte";
import { Button, FieldRow, Input, Panel, SectionHeader, Switch } from "../ui";
import { mcpSettingsService, type McpSettingsService } from "../../lib/platform/mcp";
import type { McpSettings, McpStatus } from "../../lib/generated/ironwing";
import { formatUnknownError } from "../../lib/error-format";

let { service = mcpSettingsService }: { service?: McpSettingsService } = $props();
let enabled = $state(false);
let host = $state("127.0.0.1");
let port = $state("14243");
let token = $state("");
let status = $state<McpStatus | null>(null);
let error = $state("");
let notice = $state("");
let busy = $state(false);
let loaded = $state(false);
let active = true;

onMount(() => {
  active = true;
  void load();
  const timer = setInterval(() => {
    if (!busy) void service.read().then((result) => { if (active) status = result.status; }).catch(() => {});
  }, 5000);
  return () => { active = false; clearInterval(timer); };
});

async function load() {
  try {
    const result = await service.read();
    if (!active) return;
    enabled = result.settings.enabled;
    host = result.settings.host;
    port = String(result.settings.port);
    token = result.settings.token ?? "";
    status = result.status;
    loaded = true;
  } catch (cause) { error = formatUnknownError(cause); }
}
async function apply() {
  error = "";
  notice = "";
  const portNumber = Number(port);
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
    error = "Port must be between 1 and 65535.";
    return;
  }
  busy = true;
  try {
    const settings: McpSettings = { enabled, host: host.trim(), port: portNumber, token: token || null };
    const result = await service.write(settings);
    status = result.status;
    notice = "MCP settings saved.";
  } catch (cause) {
    error = formatUnknownError(cause);
    try { status = (await service.read()).status; } catch { /* Preserve the original apply error. */ }
  } finally { busy = false; }
}
async function generateToken() {
  try { token = await service.generateToken(); notice = "Token generated. Apply to activate it."; }
  catch (cause) { error = formatUnknownError(cause); }
}
async function copy(value: string) {
  try { await navigator.clipboard.writeText(value); notice = "Copied."; }
  catch (cause) { error = formatUnknownError(cause); }
}
</script>

<Panel>
  <SectionHeader eyebrow="Agents" title="MCP server" description="Connect agents to the vehicle through IronWing." />
  {#if status && !status.supported}
    <p class="text-sm text-text-muted">The MCP server is available in the desktop application.</p>
  {:else}
    <form class="space-y-4" onsubmit={(event) => { event.preventDefault(); void apply(); }}>
      <FieldRow label="Enable MCP server" description="Start automatically with IronWing after applying settings.">
        {#snippet control()}
          <Switch checked={enabled} onCheckedChange={(value) => enabled = value} disabled={!loaded || busy} label="Enable MCP server" testId="mcp-enabled" />
        {/snippet}
      </FieldRow>
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="space-y-1 text-sm text-text-secondary">
          <span>Listen address</span>
          <Input testId="mcp-host" bind:value={host} disabled={!loaded || busy} placeholder="127.0.0.1" autocomplete="off" />
        </label>
        <label class="space-y-1 text-sm text-text-secondary">
          <span>Port</span>
          <Input testId="mcp-port" bind:value={port} disabled={!loaded || busy} inputmode="numeric" autocomplete="off" />
        </label>
      </div>
      <label class="block space-y-1 text-sm text-text-secondary">
        <span>Bearer token (optional)</span>
        <Input testId="mcp-token" type="password" bind:value={token} disabled={!loaded || busy} autocomplete="off" placeholder="No token" />
      </label>
      <div class="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={!loaded || busy} onclick={() => void generateToken()}>Generate token</Button>
        <Button type="button" variant="secondary" disabled={!token || busy} onclick={() => void copy(token)}>Copy token</Button>
        <Button type="button" variant="ghost" disabled={!token || busy} onclick={() => token = ""}>Remove token</Button>
      </div>
      <div class="space-y-2 text-sm" aria-live="polite">
        <p class="text-text-secondary">Status: {status?.running ? "Listening" : "Stopped"}</p>
        {#if status?.endpoint}
          <div class="flex flex-wrap items-center gap-2">
            <code data-testid="mcp-endpoint" class="break-all text-text-primary">{status.endpoint}</code>
            <Button type="button" size="sm" variant="ghost" onclick={() => void copy(status?.endpoint ?? "")}>Copy URL</Button>
          </div>
        {/if}
        {#if error || status?.last_error}<p role="alert" class="text-danger">{error || status?.last_error}</p>{/if}
        {#if notice}<p class="text-text-muted">{notice}</p>{/if}
      </div>
      <Button testId="mcp-apply" type="submit" disabled={!loaded || busy} loading={busy}>Apply MCP settings</Button>
    </form>
  {/if}
</Panel>
