import { describe, expect, it } from "vitest";

import { emitWebEvent, listen } from "./event";

describe("web platform event bridge", () => {
  it("delivers payloads and supports unlisten", async () => {
    const received: string[] = [];
    const unlisten = await listen<string>("test://event", (event) => {
      received.push(event.payload);
    });

    emitWebEvent("test://event", "first");
    unlisten();
    emitWebEvent("test://event", "second");

    expect(received).toEqual(["first"]);
  });
});
