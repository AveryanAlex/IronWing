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
// Match the native smoke lane's workaround for tauri-driver coordinate drift.
async function clickIntoView(element) {
  await element.waitForClickable({ timeout: 30_000 });
  await element.scrollIntoView({ block: "center", inline: "nearest" });
  await browser.execute((el) => el.click(), element);
}
async function setInput(selector, value) {
  const input = await $(selector);
  await input.setValue(value);
}

async function readParameterValues(client, ids) {
  const [context, csv] = await client.callTextBlocks("parameters_read", { ids });
  assert.equal(JSON.parse(context).source, "live_parameter_cache");
  const [header, ...rows] = csv.trimEnd().split("\r\n");
  assert.equal(header, "id,value,type,error");
  // Known ASCII parameter IDs, numeric values and type names cannot contain CSV delimiters.
  return rows.map((row) => {
    const [id, value, type, error] = row.split(",");
    assert.equal(error, "—");
    assert.ok(type);
    assert.ok(Number.isFinite(Number(value)));
    return { id, value: Number(value) };
  });
}

describe("native MCP + ArduPilot SITL", () => {
  it("enables the server in settings and diagnoses the shared live vehicle", async () => {
    const address = process.env.IRONWING_WDIO_TCP_ADDRESS;
    assert.ok(address);
    const settingsLink = await $('//nav[@aria-label="Primary"]//a[@aria-label="App settings"]');
    await settingsLink.waitForDisplayed({ timeout: 60_000 });
    await clickIntoView(settingsLink);
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
      if (!original.enabled) await clickIntoView(toggle);
      await setInput('[data-testid="mcp-host"]', "127.0.0.1");
      await setInput('[data-testid="mcp-port"]', String(port));
      await clickIntoView(apply);
      try {
        await browser.waitUntil(async () => {
          const endpoint = await $('[data-testid="mcp-endpoint"]');
          return await endpoint.isExisting() && await endpoint.getText() === `http://127.0.0.1:${port}/mcp`;
        }, { timeout: 20_000 });
      } catch (cause) {
        const details = await browser.execute(() => document.querySelector('[data-testid="mcp-apply"]')?.closest("form")?.innerText);
        throw new Error(`MCP server did not start: ${details}`, { cause });
      }
      client = await connectMcp(`http://127.0.0.1:${port}/mcp`, original.token);
      const toolNames = new Set((await client.listTools()).tools.map((tool) => tool.name));
      for (const name of ["parameters_staged_read", "parameters_stage", "parameters_staged_discard", "parameters_apply"]) {
        assert.ok(toolNames.has(name), `Missing MCP tool: ${name}`);
      }
      assert.ok(!toolNames.has("parameters_write"));
      const connected = await client.call("vehicle_connect", { transport: { kind: "tcp", address }, replace: true });
      assert.ok(connected.session_id);
      const status = await client.call("vehicle_status");
      assert.equal(status.source, "live");
      assert.equal(status.session_id, connected.session_id);
      const refreshed = await client.call("parameters_refresh");
      assert.ok(refreshed.count > 100);
      const ids = ["WPNAV_SPEED"];
      const before = await readParameterValues(client, ids);
      assert.equal(before.length, 1);
      const session = { session_id: connected.session_id };
      const stage = async (value) => {
        const current = await client.call("parameters_staged_read", session);
        return client.call("parameters_stage", {
          ...session,
          params: [{ id: ids[0], value }],
          expected_revision: current.revision,
        });
      };
      const applyStaged = async (staged, value) => {
        const applied = await client.call("parameters_apply", {
          ...session, ids, expected_revision: staged.revision,
        });
        assert.deepEqual(applied.results.map((result) => ({
          id: result.id,
          requested_value: result.requested_value,
          confirmed_value: result.confirmed_value,
          success: result.success,
        })), [{ id: ids[0], requested_value: value, confirmed_value: value, success: true }]);
        assert.ok(!applied.edits.some((edit) => edit.id === ids[0]));
      };
      // Equal values produce no staged edit. Change a navigation setting on the grounded SITL,
      // then restore it even if an assertion or the write fails.
      const changedValue = before[0].value === 500 ? 600 : 500;
      try {
        const staged = await stage(changedValue);
        const reviewed = await client.call("parameters_staged_read", session);
        assert.equal(reviewed.revision, staged.revision);
        assert.equal(reviewed.session_id, connected.session_id);
        const edit = reviewed.edits.find((edit) => edit.id === ids[0]);
        assert.ok(edit);
        assert.equal(edit.base_value, before[0].value);
        assert.equal(edit.staged_value, changedValue);
        assert.equal(edit.origin, "agent");
        assert.deepEqual(await readParameterValues(client, ids), before);
        await applyStaged(reviewed, changedValue);
        assert.deepEqual(await readParameterValues(client, ids), [{ id: ids[0], value: changedValue }]);
      } finally {
        const restored = await stage(before[0].value);
        if (restored.edits.some((edit) => edit.id === ids[0])) {
          await applyStaged(restored, before[0].value);
        }
        assert.deepEqual(await readParameterValues(client, ids), before);
      }
      const rates = await client.call("message_rates_write", { rates: [{ message_id: 29, rate_hz: 5 }, { message_id: 26, rate_hz: 5 }] });
      assert.ok(rates.results.every((r) => r.success));
      const [summary, samples] = await client.callTextBlocks("telemetry_read", { fields: ["barometer.0.pressure_hpa", "imu.0.acceleration_x_mps2"], count: 10, interval_ms: 1000 });
      assert.match(summary, /Samples: 10\/10; interval_ms: 1000; completion: complete/);
      for (const field of ["barometer.0.pressure_hpa", "imu.0.acceleration_x_mps2"]) {
        const row = samples.split("\r\n").find((line) => line.startsWith(`${field},`));
        assert.ok(row);
        // These selected numeric sample cells contain no commas; the Source column may be quoted.
        const cells = row.split(",").slice(-10);
        assert.equal(cells.length, 10);
        const values = cells.slice(2).map((cell) => /^(-?[\d.eE+]+)@(-?\d+)\/(\d+)(\+)?(?:#\d+)?$/.exec(cell));
        assert.ok(values.every((v) => v && Number.isFinite(Number(v[1])) && Number(v[3]) < 2000));
        assert.ok(values.some((v) => v?.[4] === "+"));
      }
      const [alertContext, alerts] = await client.callTextBlocks("status_text_read");
      assert.ok(alerts.startsWith("timestamp_usec,severity,sequence,text\r\n"));
      assert.equal(JSON.parse(alertContext).cursor.session_id, connected.session_id);
      await client.call("vehicle_reboot");
      await browser.waitUntil(async () => {
        try { await client.call("vehicle_connect", { transport: { kind: "tcp", address }, replace: true }); return true; }
        catch { return false; }
      }, { timeout: 90_000, interval: 2000 });
      let recovered;
      await browser.waitUntil(async () => {
        recovered = await client.call("vehicle_status");
        return Boolean(recovered.firmware?.version);
      }, {
        timeout: 10_000,
        interval: 250,
        timeoutMsg: "firmware version was not populated after reconnect",
      });
      assert.ok(recovered.firmware?.version);
      // The shell sees the same connection made by MCP.
      await $('[data-testid="app-shell-connection-indicator"]').waitForDisplayed();
      await browser.waitUntil(async () => (await $('[data-testid="app-shell-connection-indicator"]').getAttribute("class")).includes("is-positive"), { timeout: 30_000 });
    } finally {
      if (client) { try { await client.call("vehicle_disconnect"); } catch { /* Already disconnected during reboot. */ } }
      await setInput('[data-testid="mcp-host"]', original.host);
      await setInput('[data-testid="mcp-port"]', original.port);
      if ((await toggle.getAttribute("aria-checked") === "true") !== original.enabled) await clickIntoView(toggle);
      await clickIntoView(apply);
      await apply.waitForEnabled({ timeout: 20_000 });
    }
  });
});
