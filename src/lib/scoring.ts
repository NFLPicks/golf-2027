// Scoring engine for the fantasy golf league.
//
// Rules (confirmed with the commissioner, Nov 2026):
// - Six flights. Each owner has a starter and an alternate in every flight.
// - For each tournament, exactly one golfer per flight counts:
//   * the starter, if the starter is in the field;
//   * otherwise the alternate, if the alternate is in the field;
//   * otherwise nothing ($0).
// - A starter who is in the field but misses the cut or withdraws counts as $0.
//   The alternate is NOT used in that case.
// - Owners can swap before the tournament starts:
//   * "week": the alternate counts instead of the starter for that one
//     tournament (if the alternate isn't in the field, the starter still counts).
//   * "permanent": starter and alternate trade places from that tournament on,
//     until another permanent swap trades them back.
// - Score = official prize money. Each tournament is scored on its own
//   (two-event weeks have two separate weekly winners).

export const FLIGHTS = ['SUPER', 'A', 'B', 'C', 'D', 'E'] as const;
export type Flight = (typeof FLIGHTS)[number];

export const FLIGHT_LABELS: Record<Flight, string> = {
  SUPER: 'Super',
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  E: 'E',
};

export interface Slot {
  starter: string;
  alternate: string;
}

export interface Roster {
  owner: string;
  slots: Record<Flight, Slot>;
}

export type SwapKind = 'week' | 'permanent';

export interface Swap {
  tournamentId: number;
  owner: string;
  flight: Flight;
  kind: SwapKind;
}

export interface Tournament {
  id: number;
  name: string;
  dates?: string;
}

/** One row of a tournament leaderboard. earnings null = in the field but no money (MC / WD / DQ). */
export interface ResultRow {
  golfer: string;
  earnings: number | null;
}

export type GolferOutcome =
  | { inField: false }
  | { inField: true; earnings: number };

/** Normalize a golfer name so "Nicolai Højgaard" matches "Nicolai Hojgaard", "J.J. Spaun" matches "JJ Spaun", etc. */
export function normalizeName(name: string): string {
  return name
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[ßẞ]/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface TournamentField {
  get(golfer: string): GolferOutcome;
  /** Golfer names (as given) that appear in the results. */
  names(): string[];
}

/**
 * Build a lookup for one tournament's results. `aliases` maps alternate
 * spellings (normalized or not) to the canonical golfer name.
 * If a name appears twice, the first row wins (same as the old sheet).
 */
export function buildField(rows: ResultRow[], aliases: Record<string, string> = {}): TournamentField {
  const aliasMap = new Map<string, string>();
  for (const [from, to] of Object.entries(aliases)) aliasMap.set(normalizeName(from), normalizeName(to));
  const key = (n: string) => {
    const k = normalizeName(n);
    return aliasMap.get(k) ?? k;
  };
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = key(r.golfer);
    if (!map.has(k)) map.set(k, r.earnings ?? 0);
  }
  return {
    get(golfer) {
      const v = map.get(key(golfer));
      return v === undefined ? { inField: false } : { inField: true, earnings: v };
    },
    names: () => rows.map((r) => r.golfer),
  };
}

export interface FlightPick {
  flight: Flight;
  /** The golfer whose money counted (null if neither golfer played). */
  counted: string | null;
  role: 'starter' | 'alternate' | null;
  earnings: number;
  /** Who was the starter going into this tournament (after permanent swaps). */
  starter: string;
  alternate: string;
  swapped: boolean;
}

export interface OwnerTournamentScore {
  owner: string;
  total: number;
  picks: FlightPick[];
}

export interface TournamentScore {
  tournamentId: number;
  scores: OwnerTournamentScore[];
  /** Owners with the highest total (more than one on a tie). Empty if nobody earned anything. */
  winners: string[];
  topTotal: number;
}

export interface StandingRow {
  owner: string;
  rank: number;
  total: number;
  behindFirst: number;
  byFlight: Record<Flight, number>;
  weeklyWins: number;
  /** Season money of this owner's highest-earning golfer (only weeks he counted). Used to break ties. */
  bestGolfer: number;
}

export interface SeasonResult {
  tournaments: TournamentScore[];
  standings: StandingRow[];
  /** Leaders of each flight's season total (more than one on a tie). */
  flightLeaders: Record<Flight, { owners: string[]; total: number }>;
}

/** Who is starter/alternate for each owner+flight at a given tournament, after permanent swaps. */
export function lineupAt(roster: Roster, swaps: Swap[], tournamentId: number): Record<Flight, Slot & { weekSwap: boolean }> {
  const out = {} as Record<Flight, Slot & { weekSwap: boolean }>;
  for (const f of FLIGHTS) {
    let { starter, alternate } = roster.slots[f];
    let weekSwap = false;
    const mine = swaps
      .filter((s) => s.owner === roster.owner && s.flight === f && s.tournamentId <= tournamentId)
      .sort((a, b) => a.tournamentId - b.tournamentId);
    for (const s of mine) {
      if (s.kind === 'permanent') {
        [starter, alternate] = [alternate, starter];
      } else if (s.tournamentId === tournamentId) {
        weekSwap = true;
      }
    }
    out[f] = { starter, alternate, weekSwap };
  }
  return out;
}

export function scoreFlight(
  flight: Flight,
  slot: Slot & { weekSwap: boolean },
  field: TournamentField,
): FlightPick {
  const s = field.get(slot.starter);
  const a = field.get(slot.alternate);
  const base = { flight, starter: slot.starter, alternate: slot.alternate, swapped: slot.weekSwap };
  // With a one-week swap, the alternate counts if they're in the field.
  if (slot.weekSwap && a.inField) {
    return { ...base, counted: slot.alternate, role: 'alternate', earnings: a.earnings };
  }
  if (s.inField) return { ...base, counted: slot.starter, role: 'starter', earnings: s.earnings };
  if (a.inField) return { ...base, counted: slot.alternate, role: 'alternate', earnings: a.earnings };
  return { ...base, counted: null, role: null, earnings: 0 };
}

export function scoreTournament(
  tournamentId: number,
  rosters: Roster[],
  swaps: Swap[],
  field: TournamentField,
): TournamentScore {
  const scores = rosters.map((r) => {
    const lineup = lineupAt(r, swaps, tournamentId);
    const picks = FLIGHTS.map((f) => scoreFlight(f, lineup[f], field));
    return { owner: r.owner, picks, total: picks.reduce((s, p) => s + p.earnings, 0) };
  });
  const topTotal = Math.max(0, ...scores.map((s) => s.total));
  let tied = topTotal > 0 ? scores.filter((s) => nearlyEqual(s.total, topTotal)) : [];
  // Tie-break (league rule): the owner whose highest-earning golfer that week earned more wins.
  if (tied.length > 1) {
    const best = (s: OwnerTournamentScore) => Math.max(0, ...s.picks.map((p) => p.earnings));
    const top = Math.max(...tied.map(best));
    tied = tied.filter((s) => nearlyEqual(best(s), top));
  }
  const winners = tied.map((s) => s.owner);
  return { tournamentId, scores, winners, topTotal };
}

/** The most any one golfer has earned for an owner this season (optionally within one flight). */
function bestGolferOf(tournaments: TournamentScore[], owner: string, flight?: Flight): number {
  const byGolfer = new Map<string, number>();
  for (const t of tournaments) {
    for (const p of t.scores.find((s) => s.owner === owner)?.picks ?? []) {
      if (!p.counted || (flight && p.flight !== flight)) continue;
      byGolfer.set(p.counted, (byGolfer.get(p.counted) ?? 0) + p.earnings);
    }
  }
  return Math.max(0, ...byGolfer.values());
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.005;
}

export function scoreSeason(input: {
  rosters: Roster[];
  swaps: Swap[];
  /** Results keyed by tournament id. Tournaments without results are skipped. */
  results: Record<number, ResultRow[]>;
  aliases?: Record<string, string>;
}): SeasonResult {
  const ids = Object.keys(input.results)
    .map(Number)
    .sort((a, b) => a - b);
  const tournaments = ids.map((id) =>
    scoreTournament(id, input.rosters, input.swaps, buildField(input.results[id], input.aliases)),
  );

  const rows = input.rosters.map((r) => {
    const byFlight = Object.fromEntries(FLIGHTS.map((f) => [f, 0])) as Record<Flight, number>;
    let weeklyWins = 0;
    for (const t of tournaments) {
      const s = t.scores.find((x) => x.owner === r.owner)!;
      for (const p of s.picks) byFlight[p.flight] += p.earnings;
      if (t.winners.includes(r.owner)) weeklyWins++;
    }
    const total = FLIGHTS.reduce((s, f) => s + byFlight[f], 0);
    return { owner: r.owner, total, byFlight, weeklyWins, bestGolfer: bestGolferOf(tournaments, r.owner) };
  });
  // Tie-break (league rule): the owner whose highest-earning golfer (season money that counted for them) earned more.
  rows.sort((a, b) => b.total - a.total || b.bestGolfer - a.bestGolfer || a.owner.localeCompare(b.owner));
  const top = rows[0]?.total ?? 0;
  const standings: StandingRow[] = rows.map((r) => ({
    ...r,
    rank: rows.findIndex((x) => nearlyEqual(x.total, r.total) && nearlyEqual(x.bestGolfer, r.bestGolfer)) + 1,
    behindFirst: r.total - top,
  }));

  const flightLeaders = {} as SeasonResult['flightLeaders'];
  for (const f of FLIGHTS) {
    const total = Math.max(...rows.map((r) => r.byFlight[f]));
    let owners = rows.filter((r) => nearlyEqual(r.byFlight[f], total)).map((r) => r.owner);
    if (owners.length > 1) {
      const best = new Map(owners.map((o) => [o, bestGolferOf(tournaments, o, f)]));
      const topBest = Math.max(...best.values());
      owners = owners.filter((o) => nearlyEqual(best.get(o)!, topBest));
    }
    flightLeaders[f] = { total, owners };
  }

  return { tournaments, standings, flightLeaders };
}
