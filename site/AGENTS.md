# The eval site

A static React site that shows every eval, run, model and agent. Its data is generated from Inspect
logs by `site/export.py` into `public/data/` (not committed). Read this before changing anything here.

## Stack

React 19, Vite, TypeScript, `@tanstack/react-router` (file routes in `src/routes/`, kept thin; page
UI in `src/pages/`), `@tanstack/react-query` for loading the JSON (components never call `fetch`
directly; use the query options in `src/data/`), `@tanstack/react-table` for tables, Tailwind 4 with
the tokens in `src/styles/tokens.css`, `echarts` + `echarts-for-react` for every chart, Geist and
Geist Mono via `@fontsource-variable`. No other UI or chart libraries.

## Visual rules

The look follows ethPandaOps lab: a warm, quiet, dense instrument panel. Charts are artifacts, not
decoration.

- **Tokens only.** Every colour, size and radius is a token in `tokens.css`, used as a Tailwind class.
  No hex in components, no raw Tailwind palette (`bg-red-500`), no arbitrary values, no `dark:`
  variants (tokens switch with the theme). Name tokens for their role (`danger`, `muted`), never their look.
- **Three depth steps:** page (`background`), panel (`surface`), hairline (`border`). Panels are a
  1px hairline on a surface. No shadows, glows, gradients, blur, or lift on hover.
- **Type:** Geist for text and numbers, Geist Mono only for identifiers (run ids, model ids, code).
  Body 14px. Page title 24px semibold. Card title 14px semibold. Table column labels 12px muted.
  Nothing smaller than 10px. Numbers use `tabular-nums`. No uppercase-tracked display headings.
- **One accent** (terracotta `primary`). It marks the selected control, never navigation.
- **Status colour carries judgement only** (`success`, `danger`, `warning`), and always comes with a
  word or a mark. A plain number stays `foreground`.
- **Every model and every agent has one fixed colour everywhere**, from `src/lib/series.ts`. Never
  colour by index.
- **Game art is the only imagery**: item sprites from the game cache (`public/assets/items/`) and
  screenshots/replays of the runs. No icon sets in nav, headings, buttons or stat labels; no emoji.
- **Radius:** 4px for badges, 6px for every container and control.

## Copy rules

Most bad copy is copy that shouldn't be on the screen. Before writing any string, ask whether it
should exist.

- No subtitle under a heading unless it states a unit, scope or window ("per run, game ticks").
- No captions that repeat the label. "Cost" does not need "how much the run cost" under it. A bare
  "30" does need "s" beside it.
- Give every value its own place: a table column, a `<dl>` term and value, its own line. Never run
  values together with `·`, `|` or `/`.
- Cut whole clauses, not words. No marketing tone, no "Explore", no "Insights", no exclamation marks.
- Empty states say what is missing in one short sentence.

## Charts

- ECharts with the registered `site` theme (`src/lib/echarts-theme.ts`): Geist, muted 11px axis
  labels, value axis without an axis line and with hairline split lines in `border`, category/time
  axis with its line and no split lines, tooltips on `surface` with a 1px `border` and 6px radius.
- Lines 1.5px, not smoothed. Counts and CDFs are step lines.
- Cost axes are log scale with 1-2-5 ticks formatted `$0.01`, `$0.02`, `$0.05`.
- A Pareto frontier is a faint dashed line drawn under the points; frontier points are labelled.
- Success CDFs: x is a budget (game ticks, wall-clock seconds, or cost), y is the share of runs that
  finished the eval within it, counting unfinished runs as never finishing. One line per series, a
  name at the end of each line.
- Never: pie charts, 3D, dual axes with unrelated scales, smoothed counts, a palette of your own.

## Layout

- Left sidebar (eval list, models, ideas) on large screens; a top bar with a menu button below `lg`.
  Sidebar items have no icons. Sticky 48px top bar with the breadcrumb.
- Container `p-4 sm:p-6 lg:p-8`, max width 2xl screen, `gap-6` grids.
- A KPI strip is one panel divided by rules, not a card per number.
- Tables: about 40px rows, hairline row dividers, no zebra stripes, `hover:bg-background`, numbers
  right-aligned. Wide tables scroll horizontally inside their panel on small screens; the page itself
  never scrolls sideways.
- Every page works at 375px wide.

## Data

`public/data/index.json` has `evals`, `runs` (one summary per run) and `prices`. `public/data/runs/<id>.json`
has one run's detail: its turns, timeline and transcript. Shapes are in `src/data/types.ts`; keep them
in step with `site/export.py`.
