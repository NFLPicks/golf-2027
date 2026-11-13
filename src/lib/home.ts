import type { LeagueTournament } from './api';
import { buildField, type ResultRow, type SeasonResult } from './scoring';

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Last day of a tournament: its end date, else three days after the start (Thu to Sun). */
export const endDay = (t: LeagueTournament) => t.end_date ?? isoDay(new Date(Date.parse(t.start_date) + 3 * DAY));

/**
 * The tournament Home shows: the one being played now, else the next one, else the last one.
 * "Being played now" = not final yet and its last day hasn't passed.
 */
export function currentTournament(ts: LeagueTournament[], now = new Date()): LeagueTournament | undefined {
  const sorted = [...ts].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id - b.id);
  const today = isoDay(now);
  return sorted.find((t) => t.status !== 'final' && endDay(t) >= today) ?? sorted.at(-1);
}

/** Calendar sections: finished, this week (the current one, plus any other event the same week), and upcoming. */
export function calendarSections(ts: LeagueTournament[], now = new Date()) {
  const sorted = [...ts].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id - b.id);
  const cur = currentTournament(sorted, now);
  const today = isoDay(now);
  const weekAhead = isoDay(new Date(now.getTime() + 6 * DAY));
  // "This week" only once the event is within the next 6 days (or under way), not months out in the off-season.
  const thisWeek = cur && cur.status !== 'final' && endDay(cur) >= today && cur.start_date <= weekAhead
    ? sorted.filter((t) => t.start_date === cur.start_date)
    : [];
  const inWeek = new Set(thisWeek.map((t) => t.id));
  return {
    past: sorted.filter((t) => !inWeek.has(t.id) && (t.status === 'final' || endDay(t) < today)).reverse(),
    thisWeek,
    upcoming: sorted.filter((t) => !inWeek.has(t.id) && t.status !== 'final' && endDay(t) >= today),
  };
}

/** "FEB 5–8", "JUL 31–AUG 3", or "FEB 5" when the end date isn't known. */
export function dateRange(t: LeagueTournament): string {
  const fmt = (iso: string, withMonth: boolean) => {
    const d = new Date(`${iso}T12:00:00Z`);
    const m = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
    return withMonth ? `${m} ${d.getUTCDate()}` : String(d.getUTCDate());
  };
  if (!t.end_date) return fmt(t.start_date, true);
  const sameMonth = t.start_date.slice(0, 7) === t.end_date.slice(0, 7);
  return `${fmt(t.start_date, true)}–${fmt(t.end_date, !sameMonth)}`;
}

/** "1d 14h left", "3h 20m left", "12m left". */
export function timeLeft(lockAt: string, now = new Date()): string {
  const ms = Date.parse(lockAt) - now.getTime();
  if (ms <= 0) return '';
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d) return `${d}d ${h}h left`;
  if (h) return `${h}h ${m % 60}m left`;
  return `${m}m left`;
}

/**
 * Season money for each golfer: what he won on Tour in the league's events ("PGA $"),
 * and what he earned for this owner, i.e. only the weeks he counted ("For you $").
 */
export function golferMoney(
  golfers: string[],
  owner: string,
  results: Record<number, ResultRow[]>,
  season: SeasonResult,
  aliases: Record<string, string> = {},
): Map<string, { pga: number; mine: number }> {
  const out = new Map(golfers.map((g) => [g, { pga: 0, mine: 0 }]));
  for (const rows of Object.values(results)) {
    const field = buildField(rows, aliases);
    for (const g of golfers) {
      const r = field.get(g);
      if (r.inField) out.get(g)!.pga += r.earnings;
    }
  }
  for (const t of season.tournaments) {
    const mine = t.scores.find((s) => s.owner === owner);
    for (const p of mine?.picks ?? []) {
      if (p.counted && out.has(p.counted)) out.get(p.counted)!.mine += p.earnings;
    }
  }
  return out;
}

/** "Jon Lamanti" -> "JL". */
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
