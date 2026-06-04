---
name: avwap
description: Add (or re-anchor) an Anchored VWAP on one or more chart panes, anchored to an event such as earnings, a date, or a swing point. Use when the user asks for AVWAP / anchored VWAP, "VWAP from earnings", or "anchor VWAP to <date>".
---

# Anchored VWAP Workflow

Add an **Anchored VWAP** to one or more panes and anchor it to a precise point in time.
The hard part is (1) picking the right anchor timestamp and (2) targeting the right pane
reliably — both are handled below.

Typical invocations:
- `/avwap DELL earnings` — anchor to the most recent earnings (with the after-hours rule)
- `/avwap 2025-04-08` — anchor to a specific date on the current symbol
- `/avwap DELL earnings daily,65m` — only the Daily and 65-min panes

## Step 0: Read the layout

Call `pane_list` first. It returns each pane's `index`, `symbol`, and `resolution`.
You will pass that `index` as `chart_index` to every indicator call so you hit the
intended pane — do NOT rely on which pane is "active" (the active pointer drifts).

Decide which panes to act on:
- "all" / unspecified → every pane in the layout
- a timeframe list (e.g. "daily, 65m") → match against each pane's `resolution`
  (`1D`=daily, `1W`=weekly, `65`=65-min, `60`=hourly, etc.)

## Step 1: Resolve the anchor timestamp (Unix MILLISECONDS)

The Anchored VWAP input is `start_time`, in **Unix milliseconds** (Pine `time`).
Compute it cross-platform with node:

```
node -e 'console.log(Date.UTC(2026, 4, 29, 13, 30, 0))'   # months are 0-indexed → 4 = May
```

Use **13:30 UTC** (≈ 09:30 US market open) as the intraday time so the anchor lands on
the right session bar on intraday charts.

Anchor selection:

- **Earnings** — find the report date (WebSearch "<TICKER> earnings date", or ask the
  user). Then apply the **release-time rule**:
  - Reported **after the close** (most US large caps, e.g. Dell) → the reaction is the
    **next** trading session. Anchor to the next day.
  - Reported **before the open** → anchor to that same day.
  - If unsure whether it was after-hours, say so and state which day you used.
- **Specific date** — use it directly (next session if it's a weekend/holiday).
- **Swing low/high** — pull `data_get_ohlcv` for the relevant pane and pick the bar;
  use its timestamp (convert seconds→ms if needed).

## Step 2: Add or re-anchor, per pane (idempotent)

For each target pane `i`:

1. Check for an existing one: `chart_get_state` with `chart_index: i`. If a study named
   "Anchored VWAP" already exists, reuse its `entity_id` (don't add a duplicate).
2. If none exists, add it:
   `chart_manage_indicator` → `action: "add"`, `indicator: "Anchored VWAP"`,
   `chart_index: i`. Capture the returned `entity_id`.
   (Per MCP convention: add with defaults, then set inputs — never pass `inputs` on add.)
3. Set the anchor:
   `indicator_set_inputs` → `entity_id: <id>`, `chart_index: i`,
   `inputs: '{"start_time": <ms>}'`.

`chart_index` requires the MCP server build with pane-targeting support
(`chart_manage_indicator`/`indicator_set_inputs` accept `chart_index`). If the tool
rejects the param, the server predates that change and must be restarted/updated.

## Step 3: Verify and report

- `capture_screenshot` (region "full") to confirm the VWAP and its bands render from the
  anchor forward.
- Report each pane: timeframe, anchor date, and entity_id.

## Notes & caveats

- **Weekly + recent anchor**: an anchor only a few days old spans ~1 weekly bar, so the
  line is just a stub at the right edge. Mention this; offer a longer-term anchor (major
  low, YTD) for the weekly, or skip the weekly pane.
- **Symbol-linked layouts**: the VWAP recalculates for whatever symbol the pane shows, so
  if panes are symbol-synced, the AVWAP follows clicks in the watchlist automatically.
- **Bands**: the default study shows ±1σ bands. Leave as-is unless the user asks to change
  multipliers (`bands_multiplier*`) or disable bands (`calculate_stDev*`).

## Cleanup

If the user wants it removed: `chart_manage_indicator` with `action: "remove"`, the
`entity_id`, and the pane's `chart_index`.
