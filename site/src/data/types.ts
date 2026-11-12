/** Shapes of public/data, written by site/export.py. Keep in step with it. */

export interface Eval {
  id: string;
  title: string;
  /** The prompt the agent gets, verbatim */
  goal: string;
  budget_ticks: number;
  tick_ms: number;
  attempts: number;
  /** The value that counts as finished; null for evals scored by how much, not whether */
  target: number | null;
  accounts: string[];
  task_file: string;
}

export interface AttemptResult {
  attempt: number;
  ticks: number | null;
  seconds: number | null;
  best_value: number | null;
}

/** One sample of one log: an eval, an agent, a model, an epoch. */
export interface Run {
  id: string;
  eval: string;
  agent: string;
  agent_name: string;
  agent_params: Record<string, string>;
  model: string;
  epoch: number;
  started: string;
  commit: string | null;
  /** Reached the target; null for evals without a target */
  success: boolean | null;
  score: number | null;
  scores: Record<string, number | null>;
  /** Game ticks to reach the target; null if not reached */
  ticks: number | null;
  /** Wall-clock seconds to reach the target; null if not reached */
  seconds: number | null;
  budget_ticks: number;
  tick_ms: number;
  attempts: number;
  attempt_results: AttemptResult[] | null;
  ended_by: string | null;
  game_ticks: number | null;
  game_seconds: number | null;
  final_value: number | null;
  target: number | null;
  model_calls: number;
  tool_calls: number;
  model_seconds: number;
  output_tokens_per_second: number | null;
  input_tokens: number;
  output_tokens: number;
  /** USD at list price; null when the model has no price */
  cost: number | null;
  has_replay: boolean;
  account: string;
  /** The engine tick the account joined the world at, for seeking the recording */
  start_tick?: number | null;
  /** Path under /data to a screenshot of the run's end, when exported */
  screenshot?: string | null;
  /** A replay viewer for the run, when exported */
  replay_url?: string | null;
}

export interface Price {
  input: number;
  output: number;
  input_cache_write: number;
  input_cache_read: number;
}

export interface Idea {
  title: string;
  status: 'built' | 'idea' | string;
  eval?: string | null;
  why: string;
}

export interface Index {
  evals: Eval[];
  runs: Run[];
  prices: Record<string, Price>;
  ideas?: Idea[];
}

export interface TimelinePoint {
  tick: number;
  seconds: number;
  attempt?: number;
  value: number;
  accounts?: Record<string, number>;
}

export interface Action {
  tool: string;
  input: string;
  output: string | null;
  error: string | null;
}

export interface Turn {
  /** Seconds from the run's first event to this model call */
  at: number;
  model_seconds: number;
  /** Seconds from this call's end to the next call; null for the last */
  then_seconds: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  text: string | null;
  actions: Action[];
  error: string | null;
}

export interface RunDetail extends Run {
  goal: string;
  prompt: string | null;
  timeline: TimelinePoint[];
  score_metadata: Record<string, Record<string, unknown> | null>;
  turns: Turn[];
  answer: string | null;
  program_output: string | null;
  log: string;
}
