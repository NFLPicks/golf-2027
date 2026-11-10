import type { LeagueTournament } from './api';
import { FLIGHTS, lineupAt, type Flight, type Roster, type Slot, type Swap, type SwapKind } from './scoring';

export const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const isLocked = (t: LeagueTournament, now = new Date()) => new Date(t.lock_at) <= now;

/** Tournaments that are still open for swaps, soonest first. Two-event weeks show both. */
export function openTournaments(ts: LeagueTournament[], now = new Date()) {
  return ts.filter((t) => !isLocked(t, now)).sort((a, b) => +new Date(a.lock_at) - +new Date(b.lock_at));
}

export interface FlightPlan {
  flight: Flight;
  /** Starter and alternate going into this tournament (after earlier permanent swaps). */
  before: Slot;
  /** The swap already chosen for this tournament, if any. */
  choice: SwapKind | null;
  /** Who will count if both golfers play. */
  playing: string;
  bench: string;
}

/** What an owner's lineup looks like for one tournament, given their swaps. */
export function planFor(roster: Roster, swaps: Swap[], tournamentId: number): FlightPlan[] {
  const earlier = swaps.filter((s) => s.tournamentId !== tournamentId);
  const before = lineupAt(roster, earlier, tournamentId);
  return FLIGHTS.map((f) => {
    const s = swaps.find((x) => x.tournamentId === tournamentId && x.flight === f && x.owner === roster.owner);
    const choice = s?.kind ?? null;
    const b = before[f];
    const flipped = choice !== null;
    return {
      flight: f,
      before: { starter: b.starter, alternate: b.alternate },
      choice,
      playing: flipped ? b.alternate : b.starter,
      bench: flipped ? b.starter : b.alternate,
    };
  });
}

export function formatLock(iso: string) {
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
