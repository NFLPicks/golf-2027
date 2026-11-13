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
