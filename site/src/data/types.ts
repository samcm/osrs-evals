/**
 * Shapes of public/data, written by site/export.py. Keep in step with it.
 *
 * One clock for every run: `seconds` (and a turn's `at`) are wall-clock seconds since the game
 * started, which is the harness's first sample at tick 0. `tick` is game ticks since that same
 * moment, counted straight through every attempt: attempt 2 of a five-try eval starts at the tick
 * attempt 1 ended plus the reset, not at 0. Never add an attempt offset to a tick. A tick within its
 * attempt is `tick - (start tick of that attempt)`; attempt starts are the `attempt` events and the
 * first timeline point of each attempt. Ticks are clamped to the game's end (`game_ticks`).
 */

export interface Eval {
  id: string;
  /** The eval without its tries variant: quest_points for quest_points_x5 */
  base: string;
  title: string;
  /** What `value` counts, for axis names: "Quest stage", "Quest points", "Total level" */
  measure: string;
  /** The prompt the agent gets, verbatim */
  goal: string;
  budget_ticks: number;
  tick_ms: number;
  attempts: number;
  /** The value that counts as finished; null for evals scored by how much, not whether */
  target: number | null;
  accounts: string[];
  task_file: string;
  /** Where the character starts: its start save and the first tile it was recorded on */
  start?: { save: string | null; tile: [number, number] | null };
}

export interface AttemptResult {
  attempt: number;
  /** Ticks within the attempt to reach the target */
  ticks: number | null;
  seconds: number | null;
  best_value: number | null;
}

/** What a tool call was for, the same way for every agent. `wait` includes Codex polling a running
 * process (write_stdin with nothing to write); `manage` is background shells and subagents. */
export type ToolCategory = 'write+run' | 'run' | 'write' | 'read' | 'state' | 'wait' | 'stdin' | 'plan' | 'manage' | 'submit' | 'other';

/** A quest finished in a run. `source` says how we know: 'varp' read from the server's saves (the
 * quest's own varp), 'inferred' guessed from a quest-points jump, where the account was and whom it
 * last faced. An inferred quest may be null when nothing matched. */
export interface QuestDone {
  /** An id in site/game/quests.json, or null when the jump could not be matched to a quest */
  quest: string | null;
  name: string | null;
  qp: number;
  tick: number;
  attempt: number;
  /** The account that finished it, when read from the saves */
  account: string | null;
  source: 'varp' | 'inferred';
}

/** Per-run measures, in index.json, for comparing runs. Null when the run has no data for it (no
 * model, no world recording). */
export interface RunMetrics {
  /** First tick and seconds at which the eval's value changed */
  first_progress_tick: number | null;
  first_progress_seconds: number | null;
  /** Input tokens not read from or written to the prompt cache */
  input_uncached: number;
  cache_read: number;
  cache_write: number;
  /** Null for models that don't report reasoning tokens */
  reasoning_tokens: number | null;
  /** cache_read / (input_uncached + cache_read + cache_write) */
  cache_hit_rate: number | null;
  max_context_tokens: number | null;
  /** USD at list price by kind of token; null when the model has no price */
  cost_by: { input: number; output: number; cache_read: number; cache_write: number } | null;
  /** Inspect's whole sample, setup included */
  wall_seconds: number | null;
  /** From the sample's start to the game's start: the world starting and the accounts logging in */
  setup_seconds: number | null;
  /** Model call latency, seconds */
  latency_p50: number | null;
  latency_p90: number | null;
  /** Seconds from a model call's end to the next call: tools and the agent's own code */
  gap_p50: number | null;
  gap_p90: number | null;
  tool_seconds: number;
  /** Share of the agent's time spent waiting on the model */
  model_share: number | null;
  /** 'tool_calls', 'stop', 'max_tokens', ... and 'game_over' for a call the harness cut off when the game ended */
  stop_reasons: Record<string, number>;
  /** Failed model calls; the harness ending the game is not one */
  model_errors: number;
  tool_mix: Partial<Record<ToolCategory, number>>;
  tool_names: Record<string, number>;
  /** Tool errors by type (Model + bash only: parsing, timeout); calls cut off at the game's end are not counted */
  tool_errors: Record<string, number>;
  /** rs-sdk actions sent to the game (the gateway's log), the harness's own logouts left out */
  sdk_actions: number | null;
  sdk_failed: number | null;
  /** function -> [ok, failed] */
  sdk_mix: Record<string, [number, number]> | null;
  /** Scripts that connected to the game */
  scripts_run: number | null;
  /** From the world recording */
  tiles_walked: number | null;
  moving_ticks: number | null;
  running_ticks: number | null;
  /** Share of 100-tick buckets with no movement, no animation and no SDK action */
  idle_share: number | null;
  /** Moves of more than 10 tiles in one tick without walking: teleports, respawns, ladders to and from underground */
  teleports: number | null;
  deaths: number | null;
  /** 64×64 map squares visited */
  regions_visited: number | null;
  quests: QuestDone[];
}

/** One sample of one log: an eval, an agent, a model, an epoch. */
export interface Run {
  id: string;
  eval: string;
  agent: string;
  agent_name: string;
  agent_params: Record<string, string>;
  /** The thinking level the run set (omp's `thinking`, Claude Code's effort, reasoning_effort); null
   * when it set none and the harness's default applied */
  thinking: string | null;
  /** The agent CLI's version (Claude Code, Codex); null for Model + bash and programs */
  agent_version: string | null;
  model: string;
  /** Slug of the model's maker (anthropic, openai); a key of Index.vendors. Null for no model */
  vendor: string | null;
  epoch: number;
  /** When the log (the batch's task) started */
  started: string;
  /** When this sample started */
  sample_started: string | null;
  commit: string | null;
  /** The log directory the run came from, e.g. batch-haiku */
  batch: string;
  eval_set_id: string | null;
  /** Reached the target; null for evals without a target */
  success: boolean | null;
  score: number | null;
  scores: Record<string, number | null>;
  /** Game ticks to reach the target within the best attempt (the scorer's); null if not reached */
  ticks: number | null;
  /** Wall-clock seconds to reach the target within the best attempt; null if not reached */
  seconds: number | null;
  budget_ticks: number;
  tick_ms: number;
  attempts: number;
  attempt_results: AttemptResult[] | null;
  /** 'budget', 'done', 'agent finished', or a wall-clock reason */
  ended_by: string | null;
  /** Inspect's limit: 'operator' when the harness ended the game while the agent was still going */
  limit: string | null;
  /** The game's length in ticks, all attempts */
  game_ticks: number | null;
  /** Seconds on the run's clock at which the game had ended and its accounts were logged out */
  game_seconds: number | null;
  final_value: number | null;
  target: number | null;
  model_calls: number;
  tool_calls: number;
  model_seconds: number;
  output_tokens_per_second: number | null;
  /** All input tokens: uncached, cache reads and cache writes */
  input_tokens: number;
  output_tokens: number;
  /** USD at list price; null when the model has no price */
  cost: number | null;
  has_replay: boolean;
  /** The account the run is followed by: its first */
  account: string;
  /** Every account it played, the first first (a team eval has several) */
  accounts?: string[];
  /** The engine tick the account joined the world at, for seeking the recording */
  start_tick?: number | null;
  /** Path under /data to a screenshot of the run's end, when exported */
  screenshot?: string | null;
  /** A replay viewer for the run, when exported */
  replay_url?: string | null;
  metrics: RunMetrics;
}

export interface Price {
  input: number;
  output: number;
  input_cache_write: number;
  input_cache_read: number;
}

export interface Index {
  evals: Eval[];
  runs: Run[];
  prices: Record<string, Price>;
  /** Vendor slug -> display name */
  vendors: Record<string, string>;
}

/** The harness's sample of the eval's value (every 100 ticks); only the points where the value, a
 * per-account value or the attempt changed, plus the first and last points. */
export interface TimelinePoint {
  /** Game ticks since the game started, through all attempts */
  tick: number;
  /** Seconds since the game started */
  seconds: number;
  attempt?: number;
  value: number;
  accounts?: Record<string, number>;
}

export interface Action {
  tool: string;
  category: ToolCategory;
  input: string;
  output: string | null;
  error: string | null;
  /** The tool's own running time; Model + bash only (Claude Code and Codex run their tools inside the CLI) */
  seconds: number | null;
  /** Length of the whole result, before `output` was cut to 3000 characters */
  output_chars: number | null;
  /** Inspect cut the result before the model saw it */
  truncated: boolean;
  /** rs-sdk functions (bot.x, sdk.x) named in the command */
  sdk_calls: string[];
  /** Started as a background shell (Claude Code) */
  background: boolean;
  /** A few words from the model on what the call is for (omp); null when the agent doesn't ask */
  intent?: string | null;
}

export interface Turn {
  /** Seconds since the game started, when this model call was sent */
  at: number;
  /** The game tick at `at` */
  tick: number | null;
  attempt: number | null;
  model: string;
  model_seconds: number;
  /** Seconds from this call's end to the next call; null for the last */
  then_seconds: number | null;
  /** All input tokens: uncached, cache reads and cache writes */
  input_tokens: number | null;
  input_uncached: number | null;
  cache_read: number | null;
  cache_write: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  /** The size of the prompt sent */
  context_tokens: number | null;
  /** USD at list price */
  cost: number | null;
  /** 'tool_calls', 'stop', ... or 'game_over' when the harness cut the call off as the game ended */
  stop_reason: string | null;
  text: string | null;
  actions: Action[];
  /** A failed call; null for a call cut off by the game's end */
  error: string | null;
}

/** [tick, x, z, level] where the account was, one point per 10 ticks (50 in an eval's file), plus
 * every jump. A fifth element 1 marks a point reached by a jump (teleport, ladder, respawn, logging
 * back in): don't draw a line into it. Underground positions have z >= 6400. */
export type PathPoint = [tick: number, x: number, z: number, level: number, jump?: 1];

/** One entry per model call, in the order of `turns`: columns of the same length. */
export interface CallSeries {
  seconds: number[];
  tick: (number | null)[];
  latency: number[];
  /** Seconds from the call's end to the next call */
  gap: (number | null)[];
  context: (number | null)[];
  /** The category of the call's first tool call; null for a call without one */
  category: (ToolCategory | null)[];
  /** Cumulative after this call: USD (null when the model has no price) and tokens */
  cost: (number | null)[];
  input_uncached: number[];
  cache_read: number[];
  cache_write: number[];
  output: number[];
  reasoning: number[];
}

export interface SdkSeries {
  bucket_ticks: number;
  functions: string[];
  /** [bucket start tick, index into functions, ok, failed] */
  bins: [number, number, number, number][];
}

export interface ActivitySeries {
  bucket_ticks: number;
  /** Per bucket from tick 0 to the game's end: [start tick, ticks moving, ticks running, animations
   * started, tiles walked, the most common animation's name (rs-sdk seq name, e.g. human_cooking) or
   * null, rs-sdk actions] */
  rows: [number, number, number, number, number, string | null, number][];
}

export interface RunSeries {
  calls: CallSeries;
  sdk: SdkSeries | null;
  activity: ActivitySeries | null;
  /** XP per skill over time, summed over the accounts: [tick, xp] where it changed. Only when the
   * harness recorded the accounts' states (has_states) */
  xp: Record<string, [number, number][]> | null;
}

/** Things that happened, on both clocks. */
export type RunEvent = { tick: number; seconds: number } & (
  | { kind: 'attempt'; attempt: number }
  /** A script connected to the game */
  | { kind: 'script' }
  | { kind: 'death' }
  | { kind: 'teleport'; x: number; z: number; level: number }
  | { kind: 'quest'; quest: string | null; name: string | null; qp: number; source: 'varp' | 'inferred' }
  /** A skill level reached (from the recorded states) */
  | { kind: 'level'; skill: string; level: number }
  /** A stage of the eval's quest reached, read from the quest's varp (Dragon Slayer) */
  | { kind: 'stage'; quest: string; stage: number; name: string }
  /** The quest points the eval's quest needs to start, reached */
  | { kind: 'qp'; qp: number }
);

export interface RunDetail extends Run {
  goal: string;
  prompt: string | null;
  timeline: TimelinePoint[];
  score_metadata: Record<string, Record<string, unknown> | null>;
  turns: Turn[];
  /** The first account's path */
  path: PathPoint[];
  /** Each other account's path, by account, in a team's run */
  paths?: Record<string, PathPoint[]>;
  series: RunSeries;
  events: RunEvent[];
  /** The harness recorded the accounts' saved states over time (xp, items, quest varps) */
  has_states: boolean;
  answer: string | null;
  program_output: string | null;
  log: string;
}

/** public/data/evals/<id>.json: every run of one eval on one tick grid, for overlays. */
export interface EvalRuns {
  eval: string;
  /** The shared grid: ticks from 0 to budget_ticks × attempts */
  ticks: number[];
  /** Ticks between points of each run's path */
  path_every: number;
  runs: Record<
    string,
    {
      /** At each grid tick: seconds on the run's clock, the cost spent by then, the value held;
       * null past the run's end */
      seconds: (number | null)[];
      cost: (number | null)[];
      value: (number | null)[];
      path: PathPoint[];
      /** Each other account's path, by account, in a team's run */
      paths?: Record<string, PathPoint[]>;
    }
  >;
}
