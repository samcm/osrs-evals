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
| `/` (Home) | Which model at which thinking level in which harness is best, across every eval and at each? (one blended leaderboard that scales to many evals, then a featured eval) |
| `/evals/$evalId` | How did each run progress through the game, and what did it cost? |
| `/evals/$evalId/$model` | How did one model do on one eval, across thinking levels and harnesses? |
| `/models/$model` | How does one model do across every eval, at each thinking level and in each harness? |
| `/runs/$runId` | What did this agent do, minute by minute, in the game and in its head? |
| `/compare` | How do models and agents differ on any one measure, cut any way? |
| `/runs` | Every run, filterable and sortable. |

## Structure and hierarchy

Sam's words: "why are we reinventing structure and hierarchy in all these weird different angles?"
Every page has the same skeleton, and nothing on a page invents its own.

- **shadcn's dashboard, nothing bespoke.** The inset `Sidebar`; the header bar names the page with
  the `Breadcrumb` (the landing page is "Home"); the content never repeats the page's name and has no
  H1. Content is a column of shadcn `Card`s.
- **Skeleton:** `PageHeader` (a one-line description and facts, optional), `PageTabs` when the page
  has more than one view (`?tab=`), `PageToolbar` (a plain row of controls), then `PageSection`s,
  each a `Card` with `CardHeader` (`CardTitle`, controls in `CardAction`) and `CardContent`.
- **Type comes from the library:** card titles, descriptions and table text at their shadcn sizes;
  meta is small, term and value. No `text-lg`/`text-xl` in pages.
- **One centrepiece.** Each detail page opens with one thing that grabs you and shows the game: the
  eval page shows every run together in the game; the run page is a game player. Everything else
  hangs off it, in tabs or below it.
- **Each thing is listed once.** A page lists its model + harness pairings in one place (the
  leaderboard; on an eval page, the race's standings); charts key their lines with a compact legend, never a second ranked list. No chips
  or badges that only restate names already on the page.
- **Icons on a grid.** Sprites mark real events and sit in lanes, rows or table cells with a fixed
  size and spacing, never scattered.
- **Never a card inside a card.** Controls that drive several cards live in the toolbar, not
  repeated on each card.
- **Every chart is a `ChartFrame`** (`@/components/charts`) at `lead` or `compact` height, or
  `rows` for one row per group. Never size a chart by hand; y axes keep the fixed default width so
  stacked charts line up.
- **Space comes from the library and the theme:** the layout's gap between cards, the card's own
  padding inside it, `gap-2` between controls. No `p-*`/`m-*` on library components.
- **One hover per page** (`src/lib/hover.ts`): anything that names a pairing (table row via
  `hoverId`, legend key, line via `lineProps(…, { faded })`, map character) joins it; the hovered
  pairing stays at full strength and the rest fade.
- **Motion** is 150 ms of opacity or position, off under reduced motion; loading holds the final
  size with a skeleton. Nothing jumps.
- **Marks beside text:** 14 with `text-xs`, 16 with `text-sm`, 20 with `text-base` or larger, 40
  only as the `PageHeader` mark. The harness is always `HarnessMark`, the thinking level always
  `ThinkingLevel`.
- **A page's name appears once in the content area: in the header bar.**
- **Only model-driven runs.** The scripted baseline ("Program") is not on the site; the export skips
  it. There is no ideas page.

### Home

No description line (the sidebar names the product). A toolbar with the Filters button, then the
Leaderboard. The blended score is the hero: the card's description names the leading pairing, its
score and its lead over the next; each row's score is a large number over a bar of its 100 in the
model's colour. Rank,
pairing, its score, every pairing that ran every eval ranked above any that didn't, whose partial
score is muted (a thinking-level sweep runs two evals), with "How it's scored" in the card's action.
The per-eval results are secondary: a small muted number per eval that more than one pairing ran
(no tint), headed by the eval's sprite with its name on hover, each opening that model's runs of that
eval; fifty rows a page, so every pairing shows at once, `?page=`; on a phone the eval numbers sit
under the pairing's name. Then the featured eval (a Select of the evals heads the card,
`?eval=` as the eval's slug; its best run's last moment and every pairing's median progress,
compact, keyed by the leaderboard). The featured eval sits under the leaderboard, its still beside
its chart, and beside the leaderboard (eight and four of twelve columns) from 2xl.

### Eval page

`PageHeader`, one line: the eval's sprite, the goal (the prompt, which says what wins), the budget
as game time (its ticks on hover), a team's characters, and how many runs. How the server's saves
are read (varps, save files) is the README's business, never the site's. Then tabs: **Race**
(`Centerpiece`: the standings, the eval's one ranked list, beside every run together in the game
on one playhead; then `Progress`, the eval's measure over time, starting on the first screen at
1440), **Cost** (cost against result, finished within a budget, attempts), **Behaviour** (time and
tool mix, where they went), **Runs** (the table: every run's sentence under its pairing, muted, at most
two lines, the whole sentence and its chapters' titles on hover; `components/RunStory.tsx`, the same
on `/runs`). An eval about items or skills has a tab for what
the runs ended with, after Race (`eval/Held.tsx`): **Items** (collection, team wealth: the items most
runs ended holding, then each run's items as the game's sprites) or **Skills** (total level: each
run's level in every trained skill). The toolbar beside the tabs holds the open view's
controls (the runs shown, the spend, the grouping) and one Filters button (`PairingFilters`).
Behaviour's rows run in the leaderboard's order; a narrow card shows one effort measure at a time
(`?measure=`); the heat map shows every pairing pooled or one, from a Select bound to `focus`. The
Cost tab's Pareto points are labelled where they fit (the frontier always) with no legend, and a
narrow chart has a legend and no labels. Files: `src/pages/eval/`.

The race card fills the screen below its top (at least 420 px), leaving the start of the progress
chart on the first screen: the standings in five of twelve columns (four from 1800 px), as tall as
their rows (scrolling past the card's height), and the map in seven (eight) at `fitHeight`, never
shorter than the standings beside it; the standings first on a phone. The standings rank the pairings by the eval's score,
the same as every leaderboard (median result; or how many finished, then the median time to finish
in game time), in their final order from the first frame (Sam tried re-ranking as the race plays
and asked for it back: rows moving under the pointer aren't usable). Each row names its pairing (opening the
model's page on this eval at its level and harness), races its run (the pairing's median run,
the better of two middle runs, or its best, or every run, from `agg`) along a track with the
eval's quest stages as ticks and its newest quest as a sprite, and holds its result and median
cost as fixed columns; the track opens the run, and what the agent was doing at the playhead in
its own words is the track's tooltip (`centerpiece/lanes.ts`). Under each row, the title of the run's
chapter at the playhead (`summarize.py`), one muted line held from the first frame for a run with a
summary (so rows never jump as chapters load), its text on hover, opening the run there,
so the race reads as what every run is doing at that moment. Values of an eval without a target are
compact ("1.9M"), exact on hover. The playhead reads game time and the
race plays on open (under reduced motion it opens at the end). The map's view is fitted once to where every run of the eval went (the middle
99% of their positions, so a stray far-off point doesn't widen it) and never follows the pins.

### Model pages

`/models/$model` (e.g. `/models/gpt-6-2-astra`): one model across every eval. The header bar names
the model; `PageHeader` has the maker's mark, the models.dev description and its facts as meta
(maker, released, weights, context, knowledge cutoff, the inference provider when it isn't the
maker), then what ran. Its thinking filter lists the levels the model advertises. Then, first, one
table: per eval its place among the models (by each model's best pairing), result, time and cost,
and under an eval it ran as several pairings a row per pairing (each opens the eval's model page at
that level and harness); a phone keeps the eval, place and result. Score and cost by thinking level
across evals, only when it ran at more than one level; then its runs. Filtered by `level` and
`harness`, cut by `effort`. A Home row opens it with the row's level and harness preset; the
sidebar lists the models.

`/evals/$evalId/$model`: one model on one eval, every thinking level and harness it ran at. The
header bar names the eval and the model; `PageHeader` has the vendor's mark, its place among the
models on this eval, its result, median cost and runs. Then its runs race (the eval's
`Centerpiece`), the result, ticks to finish and cost by thinking level (levels along x, each
harness a series) when it ran at more than one level, its progress over time over every model's
median in grey, and its runs. On a phone the breadcrumb keeps the eval. Filtered by `level` and
`harness`, this page's own params. Files: `src/pages/model/`.

### Run page

A debugger. The header bar names the eval and the pairing with its marks (vendor, thinking level,
harness); `PageHeader` holds the result, its place among the eval's runs and its cost as meta,
the run id (its facts behind it), the epoch and previous/next. Then the game player with the
playback bar as its footer (quests and attempts on its track; the default speed plays the run in
about two minutes), and the transcript card beside it at the game's height. Without a live game
the player is the run's end screenshot, labelled "End of run", and the run doesn't start playing
by itself. In data with the accounts' held items (`held`), the game card has the client's side panel
beside the game (`run/Held.tsx`): the followed account's inventory, worn items, bank and skills at
the playhead, as the game's own sprites and stack counts, the tab in `?panel=` (skills on total
level, else the inventory). A run told by `summarize.py` has its sentence as the header's
description, its chapters as segments under the playback track and as headings in the transcript,
and the transcript is grouped by them: each chapter wraps its calls, the one at the playhead open
with its header (title, text, which of how many) pinned to the top of the feed as it scrolls, the
others folded to their title; clicking a chapter seeks the playhead there. Shown once, there. Then the timeline: a toolbar
(the x measure, the lanes menu) over a card per lane, every lane shown unless `?lanes=` names some,
each with its title, its unit as the description, its cut in the card's action, its key under the
chart and the playhead in it; the map is a media card beside the lanes (first on a phone). Every
part reads and moves the one playhead through `src/pages/run/playhead.ts` (`?t=` when settled).
Files: `src/pages/run/`.

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
- **Scope params** (`model`, `agent`, `vendor`, `thinking`: comma-separated lists) narrow every page
  and are carried on every internal link, so a scoped view stays scoped as you move around. View
  params (a chart's x measure, a sort) belong to one page and are not carried. `effort` (`best`:
  each model in each harness at its best thinking level only, as EthIQ's "best effort") is a view
  param every page reads from the root.
- Names are short and plain: `x`, `by`, `agg`, `scale`, `sort`, `page`, `hide`, `focus`, `turn`,
  `t`, `tab`, `lanes`, `code`, `speed`, `eval`, `effort`, `level`, `harness`, `map` (the race
  map's view), `heat` (the heat map's), `measure`. Lists are comma-separated. Sorts are a column id with a leading `-` for descending.
- Paths are readable: an eval is its id in kebab case (`/evals/dragon-slayer`; the old snake-case
  links redirect), a model its name without the provider route (`claude-opus-5-5`, `gpt-6.2-sol`).
- An eval's race with `t` absent plays from the start on load, at its normal pace; a link with `t`
  opens paused there.
- A run's `t` absent is its first tick: a click into a run opens it at the start and plays (at the
  default speed, once the game has drawn the world); a link with `t` is a shared moment and opens
  paused there. `acct` is the account a team's run follows.
- Theme is a preference kept in local storage; `?theme=dark` or `?theme=light` overrides it for a
  shared link.

## Identity: logos, colours, sprites

- **Models are what models.dev says they are.** A model's display name, maker (the lab, not the
  router that served it: OpenCode Go's `beam-free` is Reflection's "Beam 1.0, free"), description,
  release, knowledge cutoff (an alias's "(latest)" dropped from its name), open weights, limits, modalities and advertised thinking levels, and
  the inference provider its runs went through, come from models.dev's api.json through
  `export.py` (index.json `models` and `providers`). No hand-made name or vendor tables; only the
  colours (`MODEL_COLORS` in `src/lib/series.ts`) are ours.
- **Models** show their maker's mark beside the model name. Makers' and inference providers' logos
  are models.dev's (`https://models.dev/logos/<id>.svg`), saved by `export.py` into the data
  (`data/logos/<id>.svg`) so they ship with it and the site never hotlinks; harness marks are in
  `public/assets/brands/`. `BrandMark` draws both as a one-colour CSS mask in the text colour, so
  they suit both themes. Sizes: 14px in legends and tooltips, 16px inline and in nav, 20px in table
  rows, 40px in page headers.
- **Agent harnesses** are their mark (`HarnessMark`: omp …) after the
  model's name and thinking level, in the muted colour so the vendor's mark leads; the name is its
  tooltip. A harness on its own (grouped by harness) is its mark and its name. The scripted baseline
  ("Program") has no model; it shows its game sprite and its name.
- **Thinking levels** are a dimension, as EthIQ's efforts are: a pairing is a model at a thinking
  level in a harness, and wherever a model is named in a pairing its level sits beside it
  (`ThinkingLevel`, a lucide brain and the word). Levels are off, minimal, low, medium, high, xhigh
  and max, lowest first (`THINKING_LEVELS`), and "no thinking levels" for a model that has none
  (omp's `none`, which is not off); there is no "default". The site has only runs of the omp solver
  (`evals/omp.py@omp`), and a run's level is its solver's `thinking` param; the export skips a run
  without one, and says so. Never infer a level or fill one in.
- Logos are trademarks of their owners, used only to name their products. Never recolour them into
  series colours, alter their shape, or use them as decoration. The harness marks' sources and
  licences are listed in `public/assets/brands/SOURCES.md`.
- **Every model has one fixed colour and every agent one fixed line style and point shape**, from
  `src/lib/series.ts`, everywhere. Never colour by index. `MODEL_COLORS` (by the model's name
  without its route) holds a `--color-model-*` token from `theme.css` for every model the big run
  plays: a hue arc per model line (Opus reds, Haiku ambers, Terra limes, Luna teals, Sol blues,
  Sonnet purples), lightness and chroma chosen so every pair stays apart. Add a new model there,
  checking it against the others; one not listed gets a colour from a hash of its id. A thinking level is a lightness step of its model's colour (`levelColor`): light
  for off, dark for max. So a pairing keeps its
  model's hue, its harness's dash and shape, and its level's lightness; legends, tooltips and labels
  name the level too.
- **Game art** comes from the 2004scape cache, regenerated by the script in `site/game/`: item
  sprites, skill icons, quest reward items as quest icons, interface side icons, the world map, and
  a render of each run's character. Sprites are drawn with `Sprite` (pixelated, integer scaling
  only). Every eval has a sprite; every quest has its icon; every skill has its icon.
- Game art and the game's font stay out of the shell (sidebar, header, nav): those use lucide icons
  and the stock type. Sprites appear only in page content, where they mark something in the game.
- Tool-call categories (write and run, read, wait, …) have one name and colour each, from
  `src/lib/tools.ts`. Token kinds and SDK outcomes keep theirs everywhere too.
- Interface icons are lucide (shadcn's set), as the stock blocks use them. No other icon sets, no
  emoji.

## Visual rules

Stock shadcn/ui: the dashboard-01 block's shell and the default neutral theme, unmodified. Charts
are artifacts, not decoration. If something looks off, use the library's own pattern for it; do not
restyle library components or add a look of our own.

- **The theme is shadcn's CSS variables** (`--background`, `--card`, `--border`, `--primary`,
  `--muted-foreground`, `--chart-1…`), at shadcn's default neutral values for light and dark in
  `src/styles/theme.css`; only the data colours and `--success`/`--warning` are ours.
  Components in `src/components/ui/` stay as `shadcn add` writes them. Use the semantic classes (`bg-card`,
  `text-muted-foreground`, `border`); no hex, no raw Tailwind palette, no arbitrary values, no
  `dark:` variants in pages. Data colours (models, tool categories) are CSS variables too.
- **Depth:** page, card, border. No shadows beyond the library's defaults, no glows, gradients, blur
  or lift on hover.
- **Type:** Geist for text and numbers, Geist Mono only for identifiers (run ids, model ids, code).
  Numbers use `tabular-nums`. No uppercase-tracked headings. Use the library's sizes.
- **Colour is data.** The chrome is neutral; colour appears only for series, categories and status.
- **Status colour carries judgement only** and always comes with a word or a mark. A plain number
  stays in the text colour. Heat scales use one hue in tint steps.
- **Alignment:** cards in a row share a height; no orphan gaps. Column headers never wrap.

## Copy rules

- A page names itself once, in the header bar. No card, caption or "Goal" box restates it.
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
  state instead.
- Ticks are round (0, 10K, 20K; whole minutes; 1-2-5 dollars), from `src/lib/ticks.ts` and
  `src/lib/logAxis.ts`, and one axis never mixes "5,000" with "10K".
- End labels are the vendor mark, the short model name and the thinking level; the harness is
  carried by the line style and the legend, so a label never truncates.
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
Markers are quest icons where a quest was done; level-ups and deaths are not drawn. The race's map
holds still (fitted once to every run of the eval); the run page's map follows its character. A
team's run (several accounts) draws every account: on the race map a pin and trail each in the
run's colour, on the run page the followed account's path and the others fainter, each account
named on hover; the game and the map follow one account at a time (`acct`).

## Layout

- dashboard-01's inset `Sidebar` (a sheet on small screens, icons only when collapsed, its state
  kept in the `sidebar_state` cookie across reloads), in shadcn's labelled groups: Home, Runs and
  Compare; then **Evals** (every eval the project runs, the most runs first, each with its own
  lucide icon; one without runs yet too: its page says so in one sentence); then **Models**, a
  collapsible item per maker with its mark, opening to its models (open when one is the page). The header has `SidebarTrigger`, a separator and the `Breadcrumb`, which
  never loses its last crumb, and the theme toggle.
- One page container with the library's spacing; sections are `Card`s in grids with one gap size.
- Tables are shadcn `Table` driven by TanStack Table: numbers right-aligned, headers on one line,
  most important columns first (the pairing, then its result, then cost, so a phone shows the
  result beside the name), ids, epochs and tick counts last. A result on an eval with a target is
  its time to finish in game time, or how far it got ("6 of 10"), never the bare stage. Wide tables scroll inside their card; the page never
  scrolls sideways.
- Every page works at 375px wide. On a phone a page's toolbar is one row: its filters and secondary
  view controls fold into one Filters popover (`FiltersFold`).

## Data

`public/data/index.json` has `evals`, `runs` (one summary per run, with `metrics`), `prices`,
`models` (each model's models.dev facts) and `providers` (each maker and inference provider: name,
logo in `public/data/logos/`).
`index.json` also has `items` (the items the runs held, from `site/game/items.json`, which
`site/game/art.ts` writes with every item's sprite) and each run's `summary`.
`public/data/runs/<id>.json` has one run's detail (with `held`, each account's items and levels as
changes to replay, and, on team wealth, `series.wealth`): turns, timeline, path, and the time series
derived from the logs and the world recording. `public/data/evals/<id>.json` has every run of one
eval resampled for overlays. Shapes are in `src/data/types.ts`; keep them in step with
`site/export.py`. Never present an inferred value (such as a quest guessed from a quest-points
jump) as read from the game: the data says which it is (`source: 'inferred'`). Mark it the same way
everywhere: a faint dashed ring or underline on its icon, "≈" and one line of why in its tooltip.

- **Chapters and summaries** come from `site/summarize.py`, an offline step after the export: a
  model (through omp's gateway on Sam's subscriptions, `claude-sonnet-5-5` at medium thinking by
  default) reads each run's record and writes `runs/<id>.summary.json` (`summary`, `chapters` on
  ticks from the data), cached by the prompt's hash and the model. The site never calls a model.
  The prompt says to describe, not judge, and never to invent; the script checks the ticks.
- One clock: every `seconds` counts from the harness's first sample; every `tick` counts straight
  through all attempts. Never add an attempt offset to a tick.
- The harness's clock is monotonic, so it stood still while a machine was paused mid-run; wall
  times (model calls, the SDK log) are put on it with the pause taken out (`export.py` RunTime),
  never by wall time since the start. A model call after the game ended sits at its end.
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
