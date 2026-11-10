import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import type { Flight, ResultRow, Roster, Swap, SwapKind, Tournament } from './scoring';
import { FLIGHTS } from './scoring';

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      // New-style "sb_publishable_" keys go in the apikey header only (they aren't JWTs).
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? `Request failed (${res.status})`);
  if (body && typeof body === 'object' && 'error' in body && body.error) throw new Error(String(body.error));
  return body as T;
}

export interface LeagueTournament extends Tournament {
  start_date: string;
  lock_at: string;
  purse: number | null;
  field_url: string | null;
  status: 'upcoming' | 'in_progress' | 'final';
}

export interface League {
  season: { id: number; name: string; entry_fee: number; weekly_prize: number } | null;
  owners: { id: number; name: string }[];
  golfers: { name: string; flight: Flight }[];
  aliases: Record<string, string>;
  rosters: Roster[];
  tournaments: LeagueTournament[];
  swaps: Swap[];
  results: Record<number, ResultRow[]>;
}

interface RawLeague {
  season: League['season'];
  owners: League['owners'];
  golfers: League['golfers'];
  aliases: Record<string, string>;
  rosters: { owner: string; flight: Flight; starter: string; alternate: string }[];
  tournaments: LeagueTournament[];
  swaps: Swap[];
  results: { tournamentId: number; golfer: string; earnings: number | null }[];
}

export async function getLeague(): Promise<League> {
  const raw = await rpc<RawLeague>('get_league');
  const rosters = new Map<string, Roster>();
  for (const o of raw.owners) rosters.set(o.name, { owner: o.name, slots: {} as Roster['slots'] });
  for (const r of raw.rosters) rosters.get(r.owner)!.slots[r.flight] = { starter: r.starter, alternate: r.alternate };
  const results: League['results'] = {};
  for (const r of raw.results) (results[r.tournamentId] ??= []).push({ golfer: r.golfer, earnings: r.earnings });
  return {
    ...raw,
    // Only owners with a full roster take part in scoring.
    rosters: [...rosters.values()].filter((r) => FLIGHTS.every((f) => r.slots[f])),
    tournaments: raw.tournaments.map((t) => ({ ...t, id: Number(t.id) })),
    results,
  };
}

export interface MySwap {
  tournamentId: number;
  flight: Flight;
  kind: SwapKind;
  createdAt: string;
}

export const ownerLogin = (name: string, pin: string) => rpc<{ id: number; name: string }>('owner_login', { p_name: name, p_pin: pin });
export const getMySwaps = (name: string, pin: string) => rpc<MySwap[]>('get_my_swaps', { p_name: name, p_pin: pin });
export const setMySwap = (name: string, pin: string, tournamentId: number, flight: Flight, kind: SwapKind | null) =>
  rpc('set_my_swap', { p_name: name, p_pin: pin, p_tournament: tournamentId, p_flight: flight, p_kind: kind });

export const adminCheck = (pin: string) => rpc<boolean>('admin_check', { p_pin: pin });
export const adminSetSwap = (pin: string, owner: string, tournamentId: number, flight: Flight, kind: SwapKind | null) =>
  rpc('admin_set_swap', { p_pin: pin, p_owner: owner, p_tournament: tournamentId, p_flight: flight, p_kind: kind });
