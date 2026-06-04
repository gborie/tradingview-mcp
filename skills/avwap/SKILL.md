---
name: avwap
description: Add (or re-anchor) an Anchored VWAP on one or more chart panes, anchored to an event such as earnings, a date, or a swing point. Use when the user asks for AVWAP / anchored VWAP, "VWAP from earnings", or "anchor VWAP to <date>".
---

# Anchored VWAP Workflow

Add an **Anchored VWAP** to one or more panes and anchor it to a precise point in time,
for **any symbol**. The hard parts are (1) pointing the chart at the right symbol,
(2) picking the right anchor timestamp, and (3) targeting the right pane reliably — all
handled below.

### Arguments (all optional, order-independent)

- **symbol** — e.g. `MU`, `AAPL`, `NASDAQ:MU`. If omitted, use whatever the chart shows now.
- **anchor** — `earnings` (default), a date like `2026-03-20`, or `swing low` / `swing high`.
- **panes** — `all` (default), or a timeframe list like `daily,65m` / `weekly`.

Typical invocations:
- `/avwap MU earnings` — switch the chart to MU, anchor each pane to MU's last earnings
- `/avwap MU 2026-03-20` — MU, anchored to a specific date
- `/avwap earnings daily,65m` — current symbol, only the Daily and 65-min panes
- `/avwap AAPL swing low weekly` — AAPL, anchored to the recent swing low, weekly only

The anchor is **per-symbol** — MU's earnings/swing are not DELL's. Always resolve the
anchor against the symbol you end up on (Step 1), never carry one symbol's date to another.

## Two approaches — pick first

**A) Auto indicator — recommended for "earnings VWAP on any ticker".**
Use the bundled Pine study [`EarningsAnchoredVWAP.pine`](EarningsAnchoredVWAP.pine) (saved
in the user's TradingView account as **"Earnings-Anchored VWAP"**). It reads the *current
symbol's own* earnings via `request.earnings()` and **re-anchors automatically on every
symbol switch** — add it once per pane and never touch it again. Best when panes are
symbol-linked: clicking any watchlist ticker shows that ticker's earnings VWAP.

- `request.earnings` already fires on the **post-release session** (the bar after an
  after-hours report), so the reaction-day anchor is automatic — do NOT add an extra +1
  shift (that double-shifts to the day after; there's an off-by-default toggle for the
  rare symbol whose data lands a day early).
- Draws only the most recent leg (single clean line), with ±σ bands.
- Caveats: only as good as TV's earnings data — missing/odd for some small or foreign
  tickers, in which case no line draws (use approach B for those). Verify the anchor on a
  known symbol before trusting it.
- **Install:** open the Pine editor, `pine_open` "Earnings-Anchored VWAP" (or paste the
  `.pine` with `pine_set_source`), `pine_smart_compile`, then click the editor's
  **"Add to chart"** button with the target pane active; repeat per pane. (`createStudy`
  by name does not work for user Pine scripts — the editor "Add to chart" is the reliable
  path. `pine_smart_compile` only *saves* the script; it does not attach it.)

**B) Manual fixed anchor — for a specific date, a swing/YTD anchor, or when TV's earnings
data is wrong/missing.** Places the built-in "Anchored VWAP" at an exact `start_time`.
Follow the steps below.

## Step 0: Read the layout

Call `pane_list` first. It returns each pane's `index`, `symbol`, and `resolution`.
You will pass that `index` as `chart_index` to every indicator call so you hit the
intended pane — do NOT rely on which pane is "active" (the active pointer drifts).

Decide which panes to act on:
- "all" / unspecified → every pane in the layout
- a timeframe list (e.g. "daily, 65m") → match against each pane's `resolution`
  (`1D`=daily, `1W`=weekly, `65`=65-min, `60`=hourly, etc.)

## Step 1: Point the chart at the target symbol

If the user named a symbol and it differs from what the panes show:
- **Symbol-linked layout** (panes share one symbol — common here): set it once with
  `chart_set_symbol` and all panes follow. Clicking the ticker in the watchlist works too.
- **Not linked**: set each target pane individually with `pane_set_symbol`
  (`index`, `symbol`).

Then re-read with `pane_list` / `chart_get_state` to confirm the panes now show the
intended symbol before resolving the anchor. If no symbol was given, just use the current
one. Use an exchange-prefixed symbol if a bare ticker is ambiguous (e.g. `NASDAQ:MU`).

## Step 2: Resolve the anchor timestamp (Unix MILLISECONDS)

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

## Step 3: Add or re-anchor, per pane (idempotent)

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

## Step 4: Verify and report

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
- **Symbol drift (important)**: clicking panes to activate them, or a symbol-linked layout,
  can change the active symbol mid-operation. Always re-assert and re-confirm the symbol
  with `pane_list` *immediately before* measuring an earnings date or anchoring — never
  trust a symbol you set several calls earlier. (A wrong-symbol read once made an
  earnings-date check report the neighbouring chart's dates.)
- **Trust TV's data, verify the date**: for the auto indicator, the earnings date is
  whatever `request.earnings` returns, which may differ from a web search. When precision
  matters, confirm by labelling the earnings bar (`label.new` on the earnings bar with
  `str.format_time`) and reading it back with `data_get_pine_labels`.

## Cleanup

If the user wants it removed: `chart_manage_indicator` with `action: "remove"`, the
`entity_id`, and the pane's `chart_index`.
