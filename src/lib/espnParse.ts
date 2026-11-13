import type { ParsedResults } from './resultsParse';

/** ESPN's public leaderboard feed (no key needed). */
export const espnLeaderboardUrl = (eventId: string) =>
  `https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga&event=${encodeURIComponent(eventId)}`;

/** Pull the event ID out of whatever Jon pastes: "401811937", or an ESPN link with "/tournamentId/401811937" or "event=401811937". */
export function espnEventId(input: string): string | null {
  const t = input.trim();
  if (/^\d{6,}$/.test(t)) return t;
  const m = t.match(/(?:tournamentId[/=]|event[/=]|gameId[/=])(\d{6,})/i);
  return m ? m[1] : null;
}

export interface EspnResults extends ParsedResults {
  eventId: string;
  name: string;
  final: boolean;
  /** Purse ESPN lists for the event, if any. */
  purse: number | null;
  /** Sum of all earnings read; should be close to the purse once the event is final. */
  paid: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Read ESPN's leaderboard JSON. Every competitor is in the field; golfers who
 * missed the cut, withdrew or were DQ'd have no earnings (null, which scores $0).
 */
export function parseEspnLeaderboard(json: any): EspnResults {
  const event = json?.events?.[0];
  const competitors: any[] = event?.competitions?.[0]?.competitors;
  if (!event || !Array.isArray(competitors)) throw new Error("That doesn't look like an ESPN leaderboard.");
  const warnings: string[] = [];
  const seen = new Set<string>();
  const rows: ParsedResults['rows'] = [];
  for (const c of [...competitors].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) {
    const golfer = String(c?.athlete?.displayName ?? '').trim();
    if (!golfer) continue;
    if (seen.has(golfer)) { warnings.push(`${golfer} is listed twice; kept the first.`); continue; }
    seen.add(golfer);
    const statusName = String(c?.status?.type?.name ?? '');
    const pos = String(c?.status?.position?.displayName ?? '').trim();
    const official = (c?.statistics ?? []).find((s: any) => s?.name === 'officialAmount')?.displayValue;
    let earnings: number | null = typeof c.earnings === 'number' ? c.earnings : null;
    if ((earnings === null || earnings === 0) && typeof official === 'string' && /\d/.test(official)) earnings = Number(official.replace(/[$,]/g, ''));
    if (!earnings || earnings <= 0) earnings = null;
    const missed = statusName !== 'STATUS_FINISH' && statusName !== '' ? statusName.replace('STATUS_', '') : null;
    rows.push({ golfer, earnings, position: pos && pos !== '-' ? pos : missed });
  }
  const final = event?.status?.type?.name === 'STATUS_FINAL' || event?.status?.type?.completed === true;
  const purse = typeof event.purse === 'number' && event.purse > 0 ? event.purse : null;
  const paid = Math.round(rows.reduce((s, r) => s + (r.earnings ?? 0), 0));
  if (!final) warnings.push("ESPN doesn't show this event as final yet. Money may change.");
  else if (!paid) warnings.push('ESPN shows no prize money for this event yet.');
  return { eventId: String(event.id ?? ''), name: String(event.name ?? ''), final, purse, paid, rows, warnings };
}

// ---------- automatic Monday import ----------

/** ESPN's PGA scoreboard; `dates` (YYYYMMDD) picks the week. Its calendar lists the season's events with IDs. */
export const espnScoreboardUrl = (day?: string) =>
  `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard${day ? `?dates=${day.replace(/-/g, '')}` : ''}`;

export interface EspnEvent { id: string; name: string; start: string; end: string }

const day = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '');
const idOf = (x: any): string => {
  if (x?.id && /^\d+$/.test(String(x.id))) return String(x.id);
  const m = String(x?.event?.$ref ?? x?.$ref ?? '').match(/events\/(\d+)/);
  return m ? m[1] : '';
};

/** Every event ESPN lists in a scoreboard (calendar + events) or leaderboard response. */
export function espnEvents(json: any): EspnEvent[] {
  const out = new Map<string, EspnEvent>();
  const add = (x: any, name: unknown, start: unknown, end: unknown) => {
    const id = idOf(x);
    const s = day(start);
    if (id && s && !out.has(id)) out.set(id, { id, name: String(name ?? ''), start: s, end: day(end) || s });
  };
  for (const lg of json?.leagues ?? []) for (const c of lg?.calendar ?? []) add(c, c.label ?? c.name, c.startDate, c.endDate);
  for (const e of json?.events ?? []) add(e, e.name ?? e.shortName, e.date ?? e.startDate, e.endDate);
  return [...out.values()];
}

/** Loose event-name match: "THE PLAYERS Championship" = "The Players Championship"; sponsor words don't matter. */
export function sameEvent(a: string, b: string) {
  const skip = ['championship', 'classic', 'open', 'invitational', 'tournament', 'presented', 'pres'];
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !skip.includes(w)));
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return true;
  return [...wa].some((w) => wb.has(w));
}

/**
 * Which ESPN event is our tournament? It must overlap our dates (a day of slack either side).
 * If several do (opposite-field weeks), the name decides. Null when unsure.
 */
export function matchEspnEvent(t: { name: string; start: string; end: string }, events: EspnEvent[]): EspnEvent | null {
  const shift = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);
  const lo = shift(t.start, -1);
  const hi = shift(t.end, 1);
  const overlap = events.filter((e) => e.start <= hi && e.end >= lo);
  const named = overlap.filter((e) => sameEvent(e.name, t.name));
  if (named.length === 1) return named[0];
  if (named.length === 0 && overlap.length === 1) return overlap[0];
  return null;
}

/** Is this pull safe to save without a person looking? Returns the reason it isn't, or null. */
export function autoSaveProblem(r: EspnResults, purse: number | null): string | null {
  if (!r.final) return "ESPN doesn't show it as final yet.";
  if (!r.paid) return 'ESPN shows no prize money yet.';
  const p = purse ?? r.purse;
  if (p && (r.paid < p * 0.85 || r.paid > p * 1.2)) return `Prize money read ($${Math.round(r.paid).toLocaleString('en-US')}) is far from the purse ($${p.toLocaleString('en-US')}).`;
  return null;
}

/** Tournaments the Monday job should fetch: not final, finished (last day before today), and within the last 3 weeks. */
export function dueForImport<T extends { status: string; start_date: string; end_date?: string | null }>(ts: T[], today: string): T[] {
  const end = (t: T) => t.end_date ?? new Date(Date.parse(t.start_date) + 3 * 86_400_000).toISOString().slice(0, 10);
  const oldest = new Date(Date.parse(today) - 21 * 86_400_000).toISOString().slice(0, 10);
  return ts.filter((t) => t.status !== 'final' && end(t) < today && end(t) >= oldest);
}
