import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import type { Flight, ResultRow, Roster, Swap, SwapKind, Tournament } from './scoring';
import { FLIGHTS } from './scoring';
import type { ScheduleRow } from './scheduleParse';

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
  end_date?: string | null;
  course?: string | null;
  location?: string | null;
  defending_champion?: string | null;
  /** Logo file name in Storage (images/events); null = name-based default. */
  logo?: string | null;
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

// ---- season setup (commissioner) ----
export interface AdminOwner { name: string; email: string | null; paid: boolean }
export const adminGetOwners = (pin: string) => rpc<AdminOwner[]>('admin_get_owners', { p_pin: pin });
export const adminUpsertOwner = (pin: string, name: string, newPin: string, email: string | null, paid: boolean) =>
  rpc('admin_upsert_owner', { p_pin: pin, p_name: name, p_new_pin: newPin, p_email: email, p_paid: paid });
export const adminRemoveOwner = (pin: string, name: string) => rpc('admin_remove_owner', { p_pin: pin, p_name: name });
export const adminSetGolfers = (pin: string, rows: { name: string; flight: Flight }[]) =>
  rpc<{ rows: number }>('admin_set_golfers', { p_pin: pin, p_rows: rows });
export const adminSetRosterSlot = (pin: string, owner: string, flight: Flight, starter: string, alternate: string) =>
  rpc('admin_set_roster_slot', { p_pin: pin, p_owner: owner, p_flight: flight, p_starter: starter, p_alternate: alternate });
export const adminUpsertTournament = (
  pin: string,
  t: { id: number; name: string; start: string; lockAt: string; purse: number | null; fieldUrl: string | null },
) =>
  rpc('admin_upsert_tournament', {
    p_pin: pin, p_id: t.id, p_name: t.name, p_start: t.start, p_lock_at: t.lockAt,
    p_purse: t.purse, p_field_url: t.fieldUrl, p_espn_event_id: null,
  });
export const adminRemoveTournament = (pin: string, id: number) => rpc('admin_remove_tournament', { p_pin: pin, p_id: id });
export const adminSetResults = (pin: string, tournamentId: number, rows: { golfer: string; position: string | null; earnings: number | null }[], final: boolean) =>
  rpc<{ rows: number }>('admin_set_results', { p_pin: pin, p_tournament: tournamentId, p_rows: rows, p_final: final });
export const adminSetAlias = (pin: string, alias: string, golfer: string) =>
  rpc('admin_set_alias', { p_pin: pin, p_alias: alias, p_golfer: golfer });

// ---- event details and weekly field ----
/** The posted field for a tournament ([] = not posted yet). */
export const getField = (tournamentId: number) => rpc<string[]>('get_field', { p_tournament: tournamentId });
export const adminSetField = (pin: string, tournamentId: number, names: string[]) =>
  rpc<{ rows: number }>('admin_set_field', { p_pin: pin, p_tournament: tournamentId, p_names: names });
export const adminSetSchedule = (pin: string, rows: (ScheduleRow & { fieldUrl?: string | null })[]) =>
  rpc<{ rows: number }>('admin_set_schedule', { p_pin: pin, p_rows: rows });
