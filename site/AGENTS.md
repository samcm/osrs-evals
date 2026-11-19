# The eval site

A static React site for watching language-model agents play 2004scape (RuneScape 2, 2004). It shows
every eval, run, model and agent harness. Its data is generated from Inspect logs by `site/export.py`
into `public/data/` (not committed). Read all of this before changing anything here.

## What the site is for

A visitor should understand what happened within five seconds of landing on any page, then be able
to dig as deep as they like. It is a love letter to people who like language models, agents and
RuneScape: the game is the hero, the data is honest, the design is quiet.

Each page answers one question, first, with a chart or a table. Everything else on the page is a
way to dig into that answer.

| Page | Question it answers first |
| --- | --- |
| `/` | Which model and agent does best at what? (variant × eval grid, then every eval's progress curves) |
| `/evals/$evalId` | How did each run progress through the game, and what did it cost? |
| `/runs/$runId` | What did this agent do, minute by minute, in the game and in its head? |
| `/compare` | How do models and agents differ on any one measure, cut any way? |
| `/runs` | Every run, filterable and sortable. |
| `/ideas` | Evals we have built and want to build. |

## The five rules that matter most

1. **Text is a budget.** Every word costs the reader attention. Before writing any string, ask
   whether it should exist at all. A label that restates what the chart, the logo, the sprite, the
   column or the heading already says is deleted, not reworded.
2. **Show change, not totals.** The game happens over time, so most numbers belong on a chart against
   game ticks, wall-clock seconds, cost or model calls. A lone number is allowed only when it is the
   answer to the page's question and nothing over time says it better. Never fill a grid with
   numbers because they exist. No KPI strips.
3. **Recognise things by their marks.** Wherever a model, vendor or agent harness is named, its logo
   sits beside it. Wherever the game has an item, skill, quest or place for something, its sprite or
   the map shows it. Marks replace words where they can, not as decoration on top of them.
4. **Every chart can be cut another way.** If a chart shows something, the reader can change its x
   measure, its grouping, its aggregate or its scale, and isolate or hide series. Offer the cuts the
   data supports; don't make a new chart for each.
5. **Every state is a URL.** Filters, sorts, pages, tabs, chart modes, x measures, groupings, hidden
   or focused series, selected turns, map time, expanded rows: all of it lives in the route's search
   params, so any view can be linked. React state is only for transient hover.

## Stack

React 19, Vite, TypeScript, `@tanstack/react-router` (file routes in `src/routes/`, kept thin; page
UI in `src/pages/`), `@tanstack/react-query` for loading the JSON (components never call `fetch`
directly; use the query options in `src/data/`), `@tanstack/react-table` for tables, Tailwind 4 with
the tokens in `src/styles/tokens.css`, `echarts` + `echarts-for-react` for every chart, Geist and
Geist Mono via `@fontsource-variable`. No other UI or chart libraries.

lab (ethPandaOps) is GPL-3.0 and EthIQ has no licence: copy their ideas, never their code.

## URL state

- Each route declares its params in `validateSearch`, parsed loosely: a bad or unknown value becomes
  absent, never an error. Helpers are in `src/lib/search.ts`.
- Defaults are not written to the URL. Reading applies the default; writing a default removes the
  param. A clean URL means the default view.
- Write with `replace: true` and `resetScroll: false`. Changing a filter resets `page`.
- **Scope params** (`model`, `agent`, `vendor`: comma-separated lists) narrow every page and are
  carried on every internal link, so a scoped view stays scoped as you move around. View params (a
  chart's x measure, a sort) belong to one page and are not carried.
- Names are short and plain: `x`, `by`, `agg`, `scale`, `sort`, `page`, `hide`, `focus`, `turn`,
  `t`, `tab`. Lists are comma-separated. Sorts are a column id with a leading `-` for descending.
- Theme is a preference kept in local storage; `?theme=dark` or `?theme=light` overrides it for a
  shared link.

## Identity: logos, colours, sprites

- **Models** show their vendor's mark (Anthropic, OpenAI, Google, …) beside the model name.
  **Agents** show their harness's mark (Claude Code, Codex, OpenCode, Amp; bash for model + bash).
  The scripted baseline ("Program") uses a game sprite. Marks are in `public/assets/brands/`, drawn
  by `BrandMark` as a one-colour CSS mask in `foreground`, so they suit both themes. Sizes: 14px in
  legends and tooltips, 16px inline and in nav, 20px in table rows, 40px in page headers.
- Logos are trademarks of their owners, used only to name their products. Never recolour them into
  series colours, alter their shape, or use them as decoration. Sources and licences are listed in
  `public/assets/brands/SOURCES.md`.
- **Every model has one fixed colour and every agent one fixed line style and point shape**, from
  `src/lib/series.ts`, everywhere. Never colour by index. Add a new model to `series.ts` when it
  first appears.
- **Game art** comes from the 2004scape cache, regenerated by the script in `site/game/`: item
  sprites, skill icons, quest reward items as quest icons, interface side icons, the world map, and
  a render of each run's character. Sprites are drawn with `Sprite` (pixelated, integer scaling
  only). Every eval has a sprite; every quest has its icon; every skill has its icon.
- The game's bitmap font is allowed only in the wordmark, at its native size or an integer multiple.
- No generic icon sets (heroicons and the like), no emoji.

## Visual rules

The look follows ethPandaOps lab: a warm, quiet, dense instrument panel. Charts are artifacts, not
decoration.

- **Tokens only.** Every colour, size and radius is a token in `tokens.css`, used as a Tailwind
  class. No hex in components, no raw Tailwind palette, no arbitrary values, no `dark:` variants.
  Name tokens for their role (`danger`, `muted`), never their look. Chart code resolves tokens
  through `useThemeColors`.
- **Three depth steps:** page (`background`), panel (`surface`), hairline (`border`). No shadows,
  glows, gradients, blur, or lift on hover.
- **Type:** Geist for text and numbers, Geist Mono only for identifiers (run ids, model ids, code).
  Body 14px, page title 24px semibold, card title 14px semibold, column labels 12px muted, nothing
  under 10px. Numbers use `tabular-nums`. No uppercase-tracked headings.
- **One accent** (terracotta `primary`) marks the selected control. Never navigation.
- **Status colour carries judgement only** (`success`, `danger`, `warning`) and always comes with a
  word or a mark. A plain number stays `foreground`. Heat scales use one hue in tint steps.
- **Radius:** 4px for badges, 6px for every container and control.
- **Alignment:** cards in a row share a height; no orphan gaps. Column headers never wrap.

## Copy rules

- The page name appears once: in the breadcrumb on detail pages, as the H1 on top-level pages.
- No subtitle under a heading unless it states a unit, scope or window that the chart does not.
  Never a subtitle that repeats an axis name.
- No caption under a value that the label already implies ("Cost" needs no "at list price"; prices
  are list prices, said once on `/compare`).
- Never show two values that are the same fact in different units side by side (ticks and seconds
  at a fixed tick rate). Offer a unit toggle instead.
- Give every value its own place: a column, a `<dl>` term and value, its own line. Never run values
  together with `·`, `|` or `/`.
- Outcome words only where they add something: a quest-points run has a score, not an outcome.
- Cut whole clauses, not words. No marketing tone, no "Explore", "Insights", exclamation marks.
- Empty states say what is missing in one short sentence.

## Charts

- ECharts with the registered `site` theme (`src/lib/echarts-theme.ts`): Geist, muted 11px axis
  labels, value axis without an axis line and with hairline split lines in `border`, category/time
  axis with its line and no split lines, tooltips on `surface` with a 1px `border` and 6px radius.
- Lines 1.5px, not smoothed. Counts, scores and CDFs are step lines.
- Series are named and labelled with their marks: legends and line-end labels carry the logo.
  Legends toggle series (`hide=`) and isolate one on a second click (`focus=`).
- Charts on one page that share an x axis share the x measure control and a synced crosshair.
- The usual cuts: x as game ticks, wall-clock seconds, cost or model calls; group by model, vendor,
  agent or variant; aggregate as runs, median or best; log or linear scale for cost.
- Cost axes are log scale with 1-2-5 ticks formatted `$0.01`, `$0.02`, `$0.05`.
- A Pareto frontier is a faint dashed line drawn under the points, through non-dominated points
  only; frontier points are labelled.
- Line-end labels never collide; drop or nudge them rather than overlap.
- Axes stop at the budget; a run that ends a few ticks over is clamped, not stretched.
- Never: pie charts, 3D, dual axes with unrelated scales, smoothed counts, a palette of your own.

## The map

`WorldMap` draws the 2004scape world map (`public/assets/map/`) with paths from the run recordings.
Paths are coloured by model (eval page) or by time (run page). Its view (centre, zoom) and the
selected time are URL state. Underground positions (z ≥ 6400) are not drawn on the surface map.

## Layout

- Left sidebar on large screens, a menu button below `lg`. Eval items in the sidebar carry the
  eval's sprite. Sticky 48px top bar with the breadcrumb, which never loses its last crumb.
- Container `p-4 sm:p-6 lg:p-8`, max width 2xl screen, `gap-6` grids.
- Tables: about 40px rows, hairline dividers, no zebra stripes, `hover:bg-background`, numbers
  right-aligned, headers on one line. The table's most important columns come first; ids come last.
  Wide tables scroll inside their panel; the page never scrolls sideways.
- Every page works at 375px wide.

## Data

`public/data/index.json` has `evals`, `runs` (one summary per run, with `metrics`) and `prices`.
`public/data/runs/<id>.json` has one run's detail: turns, timeline, path, and the time series
derived from the logs and the world recording. `public/data/evals/<id>.json` has every run of one
eval resampled for overlays. Shapes are in `src/data/types.ts`; keep them in step with
`site/export.py`. Never present an inferred value (such as a quest guessed from a quest-points
jump) as read from the game: the data says which it is.
