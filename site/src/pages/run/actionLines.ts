/**
 * One thing an agent did, as a quiet line in the transcript: clauses such as "Ran cook.ts", "Read
 * API.md, actions.ts", "Searched quests", "Waited 10 s", read from the tool call's input (the shell
 * commands it ran, here-document bodies and pipeline filters skipped); and the game steps its script
 * takes ("walk, talk, pick up"), from the rs-sdk functions it names.
 */

import type { Action } from '@/data/types';

/** One clause of a line: a verb, then what it acted on. */
export interface Clause {
  verb: string;
  object?: string;
}

/**
 * The game steps a script takes, from the rs-sdk functions it names, in a fixed order. Functions
 * that only look (getState, findNearbyNpc, waitForTicks) are not steps.
 */
const STEPS: [string, string[]][] = [
  ['walk', ['walkTo', 'sendWalk']],
  ['talk', ['talkTo', 'talk', 'sendTalkToNpc', 'sendClickDialog', 'clickDialogByText', 'navigateDialog', 'sendCountDialog']],
  ['interact', ['interactLoc', 'sendInteractLoc', 'interactNpc', 'sendInteractNpc']],
  ['open door', ['openDoor']],
  ['pick up', ['pickupItem', 'sendPickup']],
  ['use item', ['useItemOnLoc', 'sendUseItemOnLoc', 'useItemOnNpc', 'sendUseItemOnNpc', 'sendUseItem', 'sendUseItemOnItem', 'useItemOnItem']],
  ['shop', ['openShop', 'buyFromShop', 'sendShopBuy', 'sellToShop']],
  ['bank', ['openBank', 'withdrawItem', 'depositItem']],
  ['equip', ['equipItem']],
  ['drop', ['dropItem', 'sendDropItem']],
  ['fight', ['attack', 'sendAttackNpc', 'sendSpellOnNpc', 'sendSetCombatStyle']],
  ['pickpocket', ['pickpocketNpc']],
  ['mine', ['mineRock']],
  ['pray', ['activatePrayer', 'deactivatePrayer', 'deactivateAllPrayers', 'sendTogglePrayer']],
  ['click interface', ['sendClickInterfaceOption', 'clickInterfaceOption', 'sendClickComponent']],
  ['skip tutorial', ['skipTutorial']],
];

export function gameSteps(calls: string[]): string[] {
  const named = new Set(calls);
  return STEPS.filter(([, fns]) => fns.some(f => named.has(f))).map(([step]) => step);
}

/** A path's last part: /opt/sdk/API.md → API.md, /opt/server/content/scripts/quests/ → quests. */
const baseName = (path: string): string => path.replace(/\/+$/, '').split('/').pop() || path;

/** A name with one brace list expanded: {romeo,juliet}.rs2 → romeo.rs2, juliet.rs2. */
function expand(name: string): string[] {
  const m = name.match(/^(.*)\{([^{}]*,[^{}]*)\}(.*)$/);
  return m ? m[2].split(',').map(part => `${m[1]}${part}${m[3]}`) : [name];
}

/** Words of one shell command, quotes removed. */
function words(command: string): string[] {
  const out: string[] = [];
  let word = '';
  let quote: string | null = null;
  let any = false;
  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = null;
      else word += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      any = true;
    } else if (/\s/.test(ch)) {
      if (word || any) out.push(word);
      word = '';
      any = false;
    } else word += ch;
  }
  if (word || any) out.push(word);
  return out;
}

/**
 * A shell input as its commands, each with whether it is the first command of its pipeline (later
 * ones, such as `| head`, only filter): here-document bodies dropped, split at `;`, `&&`, `||`,
 * `|` and new lines outside quotes.
 */
function commands(input: string): { argv: string[]; first: boolean }[] {
  const lines: string[] = [];
  let until: string | null = null;
  for (const line of input.split('\n')) {
    if (until != null) {
      if (line.trim() === until) until = null;
      continue;
    }
    lines.push(line);
    const heredoc = line.match(/<<-?\s*['"]?(\w+)['"]?/);
    if (heredoc) until = heredoc[1];
  }
  const out: { argv: string[]; first: boolean }[] = [];
  let part = '';
  let quote: string | null = null;
  let first = true;
  const push = (nextFirst: boolean): void => {
    const argv = words(part.replace(/<<-?\s*['"]?\w+['"]?/g, '').replace(/^\s*\(+/, ''));
    if (argv.length) out.push({ argv, first });
    part = '';
    first = nextFirst;
  };
  const text = lines.join('\n');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      part += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      part += ch;
    } else if (ch === '\n' || ch === ';') push(true);
    else if ((ch === '&' || ch === '|') && text[i + 1] === ch) {
      push(true);
      i++;
    } else if (ch === '|') push(false);
    else part += ch;
  }
  push(true);
  return out;
}

type Kind = 'read' | 'search' | 'list' | 'edit' | 'write' | 'run' | 'wait' | 'stop' | 'fetch';

const VERB: Record<Kind, string> = {
  read: 'Read',
  search: 'Searched',
  list: 'Listed',
  edit: 'Edited',
  write: 'Wrote',
  run: 'Ran',
  wait: 'Waited',
  stop: 'Stopped',
  fetch: 'Fetched',
};

const READERS = new Set(['cat', 'head', 'tail', 'less', 'more', 'nl', 'wc', 'jq', 'strings', 'xxd', 'od', 'file', 'stat', 'diff']);
const SEARCHERS = new Set(['grep', 'egrep', 'rg', 'ag']);
const LISTERS = new Set(['ls', 'find', 'tree', 'du']);
const RUNNERS = new Set(['bun', 'node', 'python', 'python3', 'tsx', 'deno', 'bash', 'sh', 'npx']);
/** Commands that set up the line rather than do anything: `cd /work;`, `echo ---`, `X=1` */
const QUIET = new Set(['cd', 'echo', 'printf', 'export', 'true', 'false', 'date', 'set', 'clear', 'tr', 'sort', 'uniq', 'for', 'while', 'until', 'done', 'fi', 'esac', 'case', '{', '}', '[', '[[', 'test', 'xargs', 'cp', 'mv', 'mkdir', 'rm', 'chmod', 'touch']);
/** Words that open a loop or branch body: the command after them is the one that runs */
const KEYWORDS = new Set(['do', 'then', 'else', 'if', '!', 'time', 'nohup', 'exec']);
/** Flags whose value is the next word, by command */
const VALUE_FLAGS: Record<string, string[]> = {
  head: ['-n', '-c'],
  tail: ['-n', '-c'],
  grep: ['-e', '-f', '-m', '-A', '-B', '-C'],
  egrep: ['-e', '-f', '-m', '-A', '-B', '-C'],
  rg: ['-e', '-f', '-m', '-A', '-B', '-C', '-g', '-t', '-T'],
  ag: ['-A', '-B', '-C', '-G'],
  sed: ['-e', '-f'],
  awk: ['-F', '-v', '-f'],
  find: ['-maxdepth', '-mindepth', '-type', '-name', '-iname', '-path', '-newer'],
};

/** The words after a command that name files or patterns, not flags or a flag's value. */
function operands(cmd: string, args: string[]): string[] {
  const valued = VALUE_FLAGS[cmd] ?? [];
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('-') && a.length > 1) {
      if (valued.includes(a)) i++;
      continue;
    }
    if (a === '2>&1' || a === '&' || /^\d*>/.test(a) || a.startsWith('<')) continue;
    out.push(a);
  }
  return out;
}

/** What one shell command did, as a kind and the files it touched; null for set-up. */
function shellStep(argv: string[]): { kind: Kind; targets: string[] } | { kind: 'other'; text: string } | null {
  let at = 0;
  while (at < argv.length && (KEYWORDS.has(argv[at]) || /^\w+=/.test(argv[at]) || argv[at] === 'timeout' || argv[at] === 'env' || argv[at] === 'sudo' || /^\d+[smh]?$/.test(argv[at]))) at++;
  // `X=$(grep …)`: the command is the one inside
  const sub = argv[at - 1]?.match(/^\w+=\$\((.+)$/);
  const [cmd, ...args] = sub ? [sub[1], ...argv.slice(at)] : argv.slice(at);
  if (!cmd || QUIET.has(cmd)) return null;
  const files = (list: string[]) => list.filter(f => f && f !== '-' && f !== '.' && !f.includes('*') && !f.startsWith('$')).flatMap(f => expand(baseName(f)));
  if (cmd === 'cat' && args.some(a => a.startsWith('>'))) {
    const to = args.find(a => a.length > 2 && a.startsWith('>')) ?? args[args.indexOf('>') + 1] ?? args[args.indexOf('>>') + 1];
    return to ? { kind: 'write', targets: files([to.replace(/^>+/, '')]) } : null;
  }
  if (cmd === 'tee') return { kind: 'write', targets: files(operands(cmd, args)) };
  if (cmd === 'sed' || cmd === 'perl') {
    const inPlace = args.some(a => /^-\w*i/.test(a) || a.startsWith('-0pi'));
    const scripted = args.includes('-e') || args.includes('-f');
    const rest = operands(cmd, args).slice(scripted ? 0 : 1);
    return { kind: inPlace ? 'edit' : 'read', targets: files(rest) };
  }
  if (cmd === 'awk') return { kind: 'read', targets: files(operands(cmd, args).slice(args.includes('-f') ? 0 : 1)) };
  if (READERS.has(cmd)) return { kind: 'read', targets: files(operands(cmd, args)) };
  if (SEARCHERS.has(cmd)) {
    const ops = operands(cmd, args);
    const patterned = args.includes('-e') || args.includes('-f');
    return { kind: 'search', targets: files(patterned ? ops : ops.slice(1)) };
  }
  if (LISTERS.has(cmd)) {
    const ops = operands(cmd, args);
    return { kind: 'list', targets: files(cmd === 'find' ? ops.slice(0, 1) : ops) };
  }
  if (cmd === 'sleep') return { kind: 'wait', targets: args[0] ? [`${args[0].replace(/s$/, '')} s`] : [] };
  if (cmd === 'pkill' || cmd === 'kill') return { kind: 'stop', targets: [] };
  if (cmd === 'curl' || cmd === 'wget') return { kind: 'fetch', targets: [] };
  if (RUNNERS.has(cmd)) {
    if (args.includes('-e') || args.includes('-c')) return { kind: 'run', targets: [] };
    const script = operands(cmd, args).find(a => a !== 'run' && a !== 'x');
    return { kind: 'run', targets: script ? files([script]) : [] };
  }
  if (cmd.startsWith('./') || cmd.startsWith('/work/')) return { kind: 'run', targets: [baseName(cmd)] };
  return { kind: 'other', text: argv.slice(at).join(' ') };
}

/** Up to three names, then how many more. */
function names(list: string[]): string {
  const unique = [...new Set(list)];
  return unique.length > 3 ? `${unique.slice(0, 3).join(', ')} +${unique.length - 3}` : unique.join(', ');
}

/** A shell input as clauses, one per kind of thing it did, in the order it did them. */
function shellClauses(input: string, scripted = false): Clause[] {
  const kinds = new Map<Kind, string[]>();
  let other: string | null = null;
  for (const { argv, first } of commands(input)) {
    if (!first) continue;
    const step = shellStep(argv);
    if (!step) continue;
    if (step.kind === 'other') {
      other ??= step.text;
      continue;
    }
    kinds.set(step.kind, [...(kinds.get(step.kind) ?? []), ...step.targets]);
  }
  // A script written or edited, then run, is one thing: running it
  const ran = kinds.get('run') ?? [];
  for (const kind of ['write', 'edit'] as const) {
    const made = kinds.get(kind)?.filter(f => !ran.includes(f));
    if (!made) continue;
    if (made.length) kinds.set(kind, made);
    else kinds.delete(kind);
  }
  // Reading without naming a file (`grep -c x`, `cat <<EOF`) says little next to what else it did
  for (const kind of ['read', 'search', 'list'] as const) if (kinds.size > 1 && kinds.get(kind)?.length === 0) kinds.delete(kind);
  const clauses: Clause[] = [...kinds].slice(0, 3).map(([kind, targets]) => ({
    verb: VERB[kind],
    object: targets.length ? names(targets) : kind === 'run' ? 'a script' : undefined,
  }));
  if (clauses.length === 0) {
    if (scripted) clauses.push({ verb: 'Ran', object: 'a script' });
    else if (other) clauses.push({ verb: 'Ran', object: other.length > 60 ? `${other.slice(0, 59)}…` : other });
  }
  return clauses;
}

function json(input: string): Record<string, unknown> | null {
  if (!input.trimStart().startsWith('{')) return null;
  try {
    return JSON.parse(input) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** One action as the clauses of its line. */
export function actionClauses(action: Action): Clause[] {
  const scripted = action.sdk_calls.length > 0;
  const args = json(action.input);
  switch (action.category) {
    case 'submit':
      return [{ verb: 'Submitted its answer' }];
    case 'state':
      return [{ verb: 'Checked the game' }];
    case 'wait': {
      const sleep = shellClauses(action.input).find(c => c.verb === 'Waited');
      return [{ verb: 'Waited', object: sleep?.object }];
    }
  }
  if (args) {
    const path = args.file_path ?? args.path;
    if (typeof path === 'string') return [{ verb: action.category === 'write' ? 'Wrote' : 'Read', object: baseName(path) }];
    const command = args.command ?? args.cmd;
    if (typeof command === 'string') return shellClauses(command, scripted);
    return [{ verb: 'Used', object: action.tool }];
  }
  const clauses = shellClauses(action.input, scripted);
  return clauses.length ? clauses : [{ verb: 'Used', object: action.tool }];
}
