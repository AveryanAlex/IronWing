import { describe, expect, it } from "vitest";

import { renderBootstrapFailureMarkup, runtimeTestIds } from "./runtime";

describe("renderBootstrapFailureMarkup", () => {
  it("renders product-facing failure copy and keeps diagnostic hooks", () => {
    const markup = renderBootstrapFailureMarkup("Boot sequence failed");

    expect(markup).toContain("IronWing couldn't start");
    expect(markup).toContain("Something went wrong while opening IronWing.");
    expect(markup).toContain(
      "Try restarting the app. If this keeps happening, share the message below with support.",
    );
    expect(markup).toContain("Boot sequence failed");

    expect(markup).toContain(`data-testid=\"${runtimeTestIds.bootstrapFailure}\"`);
    expect(markup).toContain(`data-testid=\"${runtimeTestIds.bootstrapFailureMessage}\"`);
    expect(markup).toContain("data-app-entrypoint");
    expect(markup).toContain("data-mount-target");
    expect(markup).toContain("data-compat-boundary");

    expect(markup).not.toContain("Svelte runtime failed");
    expect(markup).not.toContain("Legacy boundary");
    expect(markup).not.toContain("bootstrap failure");
  });
});
