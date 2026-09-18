// Minimal protocol client for the real native smoke lane. Rust tests also use rmcp's client.
export async function connectMcp(endpoint, token) {
  let id = 0;
  let session;
  async function request(method, params, notification = false) {
    const requestId = ++id;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
        ...(session ? { "Mcp-Session-Id": session } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", ...(notification ? {} : { id: requestId }), method, params }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`MCP HTTP ${response.status}: ${await response.text()}`);
    session = response.headers.get("mcp-session-id") ?? session;
    if (notification) { await response.body?.cancel(); return; }
    let message;
    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      try {
        while (!message) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
          let end;
          while ((end = pending.indexOf("\n\n")) >= 0) {
            const event = pending.slice(0, end); pending = pending.slice(end + 2);
            const data = event.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
            if (!data) continue;
            const candidate = JSON.parse(data);
            if (candidate.id === requestId) { message = candidate; break; }
          }
        }
      } finally { await reader.cancel(); }
    } else { message = await response.json(); }
    if (!message || message.error) throw new Error(`MCP response: ${JSON.stringify(message)}`);
    return message.result;
  }
  await request("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "ironwing-native-smoke", version: "1" } });
  await request("notifications/initialized", {}, true);
  async function callTool(name, args) {
    const result = await request("tools/call", { name, arguments: args });
    if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.structuredContent ?? result.content)}`);
    return result;
  }
  return {
    listTools: () => request("tools/list", {}),
    async call(name, args = {}) {
      return (await callTool(name, args)).structuredContent;
    },
    async callTextBlocks(name, args = {}) {
      const result = await callTool(name, args);
      if (result.structuredContent !== undefined) throw new Error(`${name}: expected text-only result`);
      return result.content.filter((item) => item.type === "text").map((item) => item.text);
    },
  };
}
