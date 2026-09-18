import assert from "node:assert/strict";
import net from "node:net";
import { connectMcp } from "./mcp-client.mjs";

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}
async function setInput(selector, value) {
  const input = await $(selector);
  await input.setValue(value);
}

describe("native MCP + ArduPilot SITL", () => {
  it("enables the server in settings and diagnoses the shared live vehicle", async () => {
    const address = process.env.IRONWING_WDIO_TCP_ADDRESS;
    assert.ok(address);
    const settingsLink = await $('//nav[@aria-label="Primary"]//a[@aria-label="App settings"]');
    await settingsLink.waitForDisplayed({ timeout: 60_000 });
    await settingsLink.click();
    const apply = await $('[data-testid="mcp-apply"]');
    await apply.waitForEnabled({ timeout: 30_000 });
    const toggle = await $('[data-testid="mcp-enabled"]');
    const original = {
      enabled: await toggle.getAttribute("aria-checked") === "true",
      host: await $('[data-testid="mcp-host"]').getValue(),
      port: await $('[data-testid="mcp-port"]').getValue(),
      token: await $('[data-testid="mcp-token"]').getValue(),
    };
    const port = await unusedPort();
    let client;
    try {
      if (!original.enabled) await toggle.click();
      await setInput('[data-testid="mcp-host"]', "127.0.0.1");
      await setInput('[data-testid="mcp-port"]', String(port));
      await apply.click();
      await browser.waitUntil(async () => await $('[data-testid="mcp-endpoint"]').getText() === `http://127.0.0.1:${port}/mcp`, { timeout: 20_000 });
      client = await connectMcp(`http://127.0.0.1:${port}/mcp`, original.token);
      assert.equal((await client.listTools()).tools.length, 14);
      const connected = await client.call("vehicle_connect", { transport: { kind: "tcp", address }, replace: true });
      assert.ok(connected.session_id);
      const status = await client.call("vehicle_status");
      assert.equal(status.source, "live");
      assert.equal(status.session_id, connected.session_id);
      const refreshed = await client.call("parameters_refresh");
      assert.ok(refreshed.count > 100);
      const before = await client.call("parameters_read", { ids: ["SYSID_THISMAV", "ARMING_CHECK"] });
      assert.equal(before.parameters.length, 2);
      // Echo existing values, avoiding persistent changes to the shared SITL configuration.
      const written = await client.call("parameters_write", { params: before.parameters.map((p) => ({ id: p.id, value: p.value })) });
      assert.ok(written.results.every((r) => r.success));
      const after = await client.call("parameters_read", { ids: ["SYSID_THISMAV", "ARMING_CHECK"] });
      assert.deepEqual(after.parameters.map((p) => p.value), before.parameters.map((p) => p.value));
      const rates = await client.call("message_rates_write", { rates: [{ message_id: 29, rate_hz: 5 }, { message_id: 26, rate_hz: 5 }] });
      assert.ok(rates.results.every((r) => r.success));
      const samples = await client.call("telemetry_read", { fields: ["barometer.0.pressure_hpa", "imu.0.acceleration_x_mps2"], count: 10, interval_ms: 1000 });
      assert.equal(samples.points.length, 10);
      for (const field of [0, 1]) {
        const values = samples.points.slice(2).map((p) => p.values[field]);
        assert.ok(values.every((v) => v.value !== null && v.age_ms < 2000));
        assert.ok(values.some((v) => v.new_packet));
      }
      const alerts = await client.call("status_text_read");
      assert.ok(Array.isArray(alerts.entries));
      assert.equal(alerts.cursor.session_id, connected.session_id);
      await client.call("vehicle_reboot");
      await browser.waitUntil(async () => {
        try { await client.call("vehicle_connect", { transport: { kind: "tcp", address }, replace: true }); return true; }
        catch { return false; }
      }, { timeout: 90_000, interval: 2000 });
      const recovered = await client.call("vehicle_status");
      assert.ok(recovered.firmware);
      // The shell sees the same connection made by MCP.
      await $('[data-testid="app-shell-connection-indicator"]').waitForDisplayed();
      await browser.waitUntil(async () => (await $('[data-testid="app-shell-connection-indicator"]').getAttribute("class")).includes("is-positive"), { timeout: 30_000 });
    } finally {
      if (client) { try { await client.call("vehicle_disconnect"); } catch { /* Already disconnected during reboot. */ } }
      await setInput('[data-testid="mcp-host"]', original.host);
      await setInput('[data-testid="mcp-port"]', original.port);
      if ((await toggle.getAttribute("aria-checked") === "true") !== original.enabled) await toggle.click();
      await apply.click();
    }
  });
});
