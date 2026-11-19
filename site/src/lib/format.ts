/** Number formatting shared by tables, KPIs and charts. Missing values render as an en dash. */

export const MISSING = '–';

const intFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function formatInt(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? MISSING : intFormat.format(value);
}

export function formatDecimal(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? MISSING : oneDecimal.format(value);
}

/** Token counts: grouped digits below 100,000, compact above ("1.2M"). */
export function formatTokens(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return MISSING;
  return Math.abs(value) >= 100_000 ? compactFormat.format(value) : intFormat.format(value);
}

/** USD with four decimals below a dollar so a column of small costs lines up. */
export function formatCost(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return MISSING;
  if (value === 0) return '$0';
  if (Math.abs(value) >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

/** A cost axis tick on the 1-2-5 steps: $0.01, $0.02, $0.05, $1. */
export function formatCostTick(value: number): string {
  if (value >= 1) return `$${Number(value.toPrecision(3))}`;
  return `$${Number(value.toPrecision(1))}`;
}

export function formatPercent(share: number | null | undefined): string {
  return share == null || Number.isNaN(share) ? MISSING : `${Math.round(share * 100)}%`;
}

/** Seconds as a number with one decimal under 100 s, whole above. */
export function formatSeconds(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return MISSING;
  return value < 100 ? oneDecimal.format(value) : intFormat.format(value);
}

/** A long span: "4 min 21 s", "1 h 12 min". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return MISSING;
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes} min ${s % 60} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** A clock position within a run: "4:21", "1:02:03". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

export function capitalize(text: string | null | undefined): string {
  if (!text) return MISSING;
  return text.charAt(0).toUpperCase() + text.slice(1).replace(/_/g, ' ');
}

/** Axis numbers: compact from 10,000 up ("40K", "1.2M"), grouped digits below. */
export function formatAxisNumber(value: number): string {
  if (Math.abs(value) >= 10_000) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
}
