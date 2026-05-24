# Browser CPU profiling guide

## Goal

Capture a real Chromium CPU profile for frontend hotspots, then inspect the flamegraph in DevTools or Speedscope.

This is especially useful for cases like:

- HUD map rotation in airplane loiter
- expensive Svelte rerenders
- MapLibre terrain / tile churn
- worker or main-thread regressions after UI changes

## Recommended setup

Run the web app from the repo root:

```bash
pnpm run dev:web
```

That starts:

- SITL
- the WebSocket bridge
- the pure web frontend

Default URL:

```text
http://localhost:5173
```

## Repro recipe for the HUD map case

1. Open the app in Chromium.
2. Select **Demo vehicle**.
3. Select **Airplane**.
4. Connect.
5. Open **HUD**.
6. Confirm the mode is **LOITER**.
7. Arm the vehicle.
8. Let it rotate for several seconds before and during capture.

This scenario is useful because continuous heading changes keep the HUD map camera moving.

## Capture a profile in Chrome DevTools

1. Open DevTools.
2. Go to the **Performance** tab.
3. Enable screenshots only if you need them; otherwise leave extra capture features off.
4. Click **Record**.
5. Perform the laggy interaction.
6. Stop recording after roughly 10-15 seconds.
7. Save the profile.

Artifacts to save:

- DevTools performance trace JSON, if you want the full renderer timeline
- `.cpuprofile`, if you want a lightweight JS flamegraph artifact

## Capture a CPU profile programmatically

For reproducible profiling, use Chromium DevTools Protocol `Profiler` APIs:

- `Profiler.enable`
- `Profiler.setSamplingInterval`
- `Profiler.start`
- wait through the hot interaction
- `Profiler.stop`

Save the returned profile JSON as `*.cpuprofile`.

This is the best approach when you want stable before/after comparisons for a specific scenario.

## View the flamegraph

### Option A: Chrome DevTools

Open the saved CPU profile in DevTools Performance/Profiler views.

### Option B: Speedscope

Open the profile in Speedscope:

```text
https://www.speedscope.app/
```

Useful views:

- **Time Order**: what happened over time
- **Left Heavy**: hottest stacks grouped by total cost
- **Sandwich**: callers and callees for a selected frame

## What to look for

### App code hotspots

Look for repeated time in app functions such as:

- camera update loops
- smoothing helpers
- derived-store recomputation
- large list/model rebuilds
- reactive effects firing too often

### MapLibre hotspots

Common expensive paths include:

- tile selection / retention
- terrain queries
- raster decode / bitmap work
- layer opacity / crossfade updates
- repeated camera jumps causing full rerender work

### Signs of over-updating

Red flags:

- a `requestAnimationFrame` loop that rarely goes idle
- `jumpTo()` or equivalent camera updates every frame
- smoothing durations longer than incoming telemetry cadence
- repeated tile fetch / retry / 404 churn
- duplicate DEM or raster work for multiple layers

## Interpreting JS CPU profiles correctly

A Chromium CPU profile is mainly a **main-thread JavaScript** profile.

It does **not** fully represent:

- GPU time
- compositor cost
- some worker activity
- network wait time by itself

So use CPU profiles together with:

- DevTools Performance timeline
- console/network inspection
- app-specific repro steps

## Suggested workflow for regressions

1. Capture a baseline profile on the target scenario.
2. Save the artifact.
3. Make one focused change.
4. Re-run the exact same scenario.
5. Compare:
   - hottest stacks
   - total sampling distribution
   - frame pacing
   - network / tile churn

## HUD map case: current working hypothesis

For the airplane-loiter HUD case, the most likely expensive pattern is:

- continuous camera updates
- MapLibre terrain + raster work
- repeated tile / terrain recalculation during heading rotation

If the flamegraph confirms MapLibre-heavy stacks during rotation, prioritize:

1. throttling camera updates
2. only updating on meaningful deltas
3. reducing HUD map rendering complexity
4. eliminating avoidable tile / terrain churn

## Notes

- Prefer profiling in Chromium for reproducibility.
- Capture at least 10 seconds for rotating/steady-state issues.
- Keep the scenario narrow; broad captures are harder to compare.
