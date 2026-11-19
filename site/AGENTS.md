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
| `/` | Which model in which harness is best, across every eval and at each? (one blended leaderboard that scales to many evals, then a featured eval) |
| `/evals/$evalId` | How did each run progress through the game, and what did it cost? |
| `/runs/$runId` | What did this agent do, minute by minute, in the game and in its head? |
| `/compare` | How do models and agents differ on any one measure, cut any way? |
| `/runs` | Every run, filterable and sortable. |

## Structure and hierarchy

Sam's words: "why are we reinventing structure and hierarchy in all these weird different angles?"
Every page has the same skeleton, and nothing on a page invents its own.

- **Skeleton:** `PageHeader` (`src/components/page.tsx`), then `PageTabs` when the page has more
  than one view (`?tab=`), then sections, each a `Card` with `CardHeader` (`CardTitle`, controls in
  `CardAction`) and `CardContent`.
- **Type has four levels and no others:** the page title (H1, `PageHeader`), its description
  (muted, one line), meta (small, term and value), then card titles. A page's result is meta, not a
  second headline; nothing on a page is the same size as the title. No `text-lg`/`text-xl` in pages.
- **One centrepiece.** Each detail page opens with one thing that grabs you and shows the game: the
  eval page shows every run together in the game; the run page is a game player. Everything else
  hangs off it, in tabs or below it.
- **Each thing is listed once.** A page lists its model + harness pairings in one place (the
  leaderboard); charts key their lines with a compact legend, never a second ranked list. No chips
  or badges that only restate names already on the page.
- **Icons on a grid.** Sprites mark real events and sit in lanes, rows or table cells with a fixed
  size and spacing, never scattered.
- **A page is** `PageHeader`, `PageTabs` (if it has views), `PageToolbar` (sticky, if it has
  shared controls), then `PageSection`s. The centrepiece is `<PageSection lead>`, full bleed. Use a
  `Card` only for a thing that stands apart from the page's flow: never a card per chart, never a
  card inside a section or another card. Controls that drive several charts live in the toolbar,
  not repeated on each chart.
- **Every chart is a `ChartFrame`** (`@/components/charts`) at `lead` or `compact` height, or
  `rows` for one row per group. Never size a chart by hand; y axes keep the fixed default width so
  stacked charts line up.
- **Space comes from the theme only:** `gutter` between sections and around the page, `stack`
  within a section, `gap-2` between controls. No `p-*`/`m-*` on library components.
- **One hover per page** (`src/lib/hover.ts`): anything that names a pairing (table row via
  `hoverId`, legend key, line via `lineProps(…, { faded })`, map character) joins it; the hovered
  pairing stays at full strength and the rest fade.
- **Motion** is 150 ms of opacity or position, off under reduced motion; loading holds the final
  size with a skeleton. Nothing jumps.
- **Marks beside text:** 14 with `text-xs`, 16 with `text-sm`, 20 with `text-base` or larger, 40
  only as the `PageHeader` mark. The harness is always `HarnessBadge`.
- **The breadcrumb's last crumb and the H1 name the page the same way.**
- **Only model-driven runs.** The scripted baseline ("Program") is not on the site; the export skips
  it. There is no ideas page.

### Eval page

`PageHeader` (sprite, title, the goal, budget), then tabs: **Overview** (`Centerpiece`: every run
together in the game, on one playhead; `Progress`: the eval's measure over time; `Leaderboard`:
the one ranked list), **Cost** (cost against result, finished within a budget, attempts),
**Behaviour** (time and tool mix, where they went), **Runs** (the table). Files: `src/pages/eval/`.

### Run page

A debugger. `PageHeader` (the character, model and harness, eval and epoch, the result as meta,
previous and next). Then the game player and the agent's thinking side by side on one playhead,
the playback bar under them, then the timeline lanes and the map on the same playhead. Every part
reads and moves the playhead through `src/pages/run/playhead.ts` (`?t=` when settled). Files:
`src/pages/run/`.

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
directly; use the query options in `src/data/`), `@tanstack/react-table` for tables, Tailwind 4,
Geist and Geist Mono via `@fontsource-variable`.

**Use the libraries; don't hand-roll UI.** Every component comes from **shadcn/ui** (Radix
primitives, in `src/components/ui/`, added with `npx shadcn@latest add <name>`): Card, Button,
Badge, Table, Tabs, ToggleGroup, Select, Tooltip, Popover, Command, Slider, Sidebar, Breadcrumb,
Collapsible, Skeleton and so on. Every chart is a **shadcn chart** (`ChartContainer`,
`ChartTooltip`, `ChartLegend` over Recharts). Use their default spacing, sizes and structure; a
page composes them and never re-styles their padding, radius or type. When a library component
almost fits, use it as is; edit the generated file in `components/ui/` only to change the whole
site's look, never for one page. The only custom-drawn component is the world map.

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
  `t`, `tab`, `lanes`, `code`, `speed`, `eval`. Lists are comma-separated. Sorts are a column id with a leading `-` for descending.
- Theme is a preference kept in local storage; `?theme=dark` or `?theme=light` overrides it for a
  shared link.

## Identity: logos, colours, sprites

- **Models** show their vendor's mark (Anthropic, OpenAI, Google, …) beside the model name. Marks
  are in `public/assets/brands/`, drawn by `BrandMark` as a one-colour CSS mask in the text colour,
  so they suit both themes. Sizes: 14px in legends and tooltips, 16px inline and in nav, 20px in
  table rows, 40px in page headers.
- **Agent harnesses** are a quiet `Badge` with the harness's name after the model ("Claude Code",
  "Codex", "bash"), never a second logo: two marks side by side read as noise. The scripted
  baseline ("Program") has no model; it shows its game sprite and its name.
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
- Tool-call categories (write and run, read, wait, …) have one name and colour each, from
  `src/lib/tools.ts`. Token kinds and SDK outcomes keep theirs everywhere too.
- No generic icon sets (heroicons and the like), no emoji.

## Visual rules

A warm, quiet, dense instrument panel, after ethPandaOps lab, built from shadcn/ui. Charts are
artifacts, not decoration.

- **The theme is shadcn's CSS variables** (`--background`, `--card`, `--border`, `--primary`,
  `--muted-foreground`, `--chart-1…`), set in `src/styles/` to the warm palette (cream page, white
  cards, terracotta primary) for light and dark. Use the semantic classes (`bg-card`,
  `text-muted-foreground`, `border`); no hex, no raw Tailwind palette, no arbitrary values, no
  `dark:` variants in pages. Data colours (models, tool categories) are CSS variables too.
- **Depth:** page, card, border. No shadows beyond the library's defaults, no glows, gradients, blur
  or lift on hover.
- **Type:** Geist for text and numbers, Geist Mono only for identifiers (run ids, model ids, code).
  Numbers use `tabular-nums`. No uppercase-tracked headings. Use the library's sizes.
- **One accent** (terracotta `primary`) marks the selected control. Never navigation.
- **Status colour carries judgement only** and always comes with a word or a mark. A plain number
  stays in the text colour. Heat scales use one hue in tint steps.
- **Alignment:** cards in a row share a height; no orphan gaps. Column headers never wrap.

## Copy rules

- A page names itself once in its content, in the H1. No card, caption or "Goal" box restates it.
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

- shadcn charts: one `ChartContainer` per chart with a `ChartConfig` built from `src/lib/series.ts`
  (labels, marks and colours), `ChartTooltip` with `ChartTooltipContent` (or a content component
  built from it), the library's axis and grid look. No hand-made chart chrome.
- Lines 1.5–2px, not smoothed. Counts, scores and CDFs are step lines (`type="stepAfter"`).
- Series are named and labelled with their marks: legends and line-end labels carry the logo.
  Legends toggle series (`hide=`) and isolate one on a second click (`focus=`).
- Charts on one page that share an x axis share the x measure control and a synced crosshair
  (Recharts `syncId`). Recharts syncs only at identical x values, so sample every synced chart on
  the same x grid; a chart with no lines draws no synced cursor, so pass the hovered x down as
  state instead (the eval page's quest strip does).
- Ticks are round (0, 10K, 20K; whole minutes; 1-2-5 dollars), from `src/lib/ticks.ts` and
  `src/lib/logAxis.ts`, and one axis never mixes "5,000" with "10K".
- End labels are the vendor mark and the short model name only; the harness is carried by the
  line style and the legend, so a label never truncates.
- The usual cuts: x as game ticks, wall-clock seconds, cost or model calls; group by model, vendor,
  agent or variant; aggregate as runs, median or best; log or linear scale for cost.
- Cost axes that compare runs are log scale with 1-2-5 ticks formatted `$0.01`, `$0.02`, `$0.05`
  (`src/lib/logAxis.ts`). One run's cumulative spend, stacked by token kind, is linear.
- A Pareto frontier is a faint dashed line drawn under the points, through non-dominated points
  only; frontier points are labelled.
- Line-end labels never collide; drop or nudge them rather than overlap (`layoutEndLabels`).
- Axes stop at the budget; a run that ends a few ticks over is clamped, not stretched.
- Never: pie charts, 3D, dual axes with unrelated scales, smoothed counts, a palette of your own.

## The map

`WorldMap` draws the 2004scape world map (`public/assets/map/`) with paths from the run recordings.
Paths are coloured by model (eval page) or by time (run page). Its view (centre, zoom) and the
selected time are URL state. Underground positions (z ≥ 6400) are not drawn on the surface map.
Never letterbox the map or show past its edges: give it `fitHeight` so the frame takes the paths'
shape (up to `height`), or a height that matches its neighbour. Zoom stops where the map fills the
frame, and the view is kept on the map.
Markers are sprites: quest icons where a quest was done, the hitpoints heart for a death, skill
icons for level-ups.

## Layout

- shadcn `Sidebar` (collapsible to a sheet on small screens) with the evals, each with its sprite,
  and a header with `SidebarTrigger` and the `Breadcrumb`, which never loses its last crumb.
- One page container with the library's spacing; sections are `Card`s in grids with one gap size.
- Tables are shadcn `Table` driven by TanStack Table: numbers right-aligned, headers on one line,
  most important columns first, ids last. Wide tables scroll inside their card; the page never
  scrolls sideways.
- Every page works at 375px wide.

## Data

`public/data/index.json` has `evals`, `runs` (one summary per run, with `metrics`) and `prices`.
`public/data/runs/<id>.json` has one run's detail: turns, timeline, path, and the time series
derived from the logs and the world recording. `public/data/evals/<id>.json` has every run of one
eval resampled for overlays. Shapes are in `src/data/types.ts`; keep them in step with
`site/export.py`. Never present an inferred value (such as a quest guessed from a quest-points
jump) as read from the game: the data says which it is (`source: 'inferred'`). Mark it the same way
everywhere: a faint dashed ring or underline on its icon, "≈" and one line of why in its tooltip.

- One clock: every `seconds` counts from the harness's first sample; every `tick` counts straight
  through all attempts. Never add an attempt offset to a tick.
- Each run's result is its best value over its attempts, not its last.
- Game art comes from `site/game/build.sh` (the rs-sdk image at the pinned commit); run
  `site/game/build.sh avatars` after an export so new runs get their character. Don't hand-edit
  files in `public/assets`.

## Checking your work

- Run the Vite dev server (`cd site && npx vite`), which serves `public/data`, and look at every
  page you touched at 1440 and 390 wide, light and dark (`?theme=dark`), with agent-browser at
  device scale 2. `document.documentElement.scrollWidth` must equal the viewport width at 390.
- Full-page captures show charts below the fold blank (they draw once scrolled into view), so
  scroll to each chart and capture the viewport to judge it.
- Change every control, reload, and check the same view comes back from the URL.
- Read every string on the page once more and delete the ones that restate something.
- Grep your files for hand-tuned spacing on library components (`p-*`, `px-*`, `mt-*` on a Card,
  CardHeader, Table or Button) and remove it: the library's spacing is the site's spacing.
