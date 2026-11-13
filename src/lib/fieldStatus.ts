import { buildField, FLIGHTS, lineupAt, type Flight, type Roster, type Swap } from './scoring';

export type InField = 'in' | 'out' | 'unknown';

export interface WeekFlight {
  flight: Flight;
  /** Starter and alternate for this tournament (after permanent swaps). */
  starter: string;
  alternate: string;
  /** A this-week-only swap is set for this flight. */
  weekSwap: boolean;
  starterIn: InField;
  alternateIn: InField;
  /**
   * The golfer who will count, using the same rules as scoring.
   * null = neither golfer is in the field. Before the field is posted, this is who counts if both play.
   */
  counts: string | null;
  /** Short summary for the flight header. */
  summary: 'both' | 'starter-in' | 'alternate-in' | 'none' | 'pending';
}

/**
 * Who is in the field and who will count, per flight, for one owner and tournament.
 * `field` is the posted field (golfer names); null or empty = not posted yet.
 * Mirrors scoreFlight() so what Home promises always matches what gets scored.
 */
export function weekStatus(
  roster: Roster,
  swaps: Swap[],
  tournamentId: number,
  field: string[] | null,
  aliases: Record<string, string> = {},
): WeekFlight[] {
  const lineup = lineupAt(roster, swaps, tournamentId);
  const posted = !!field && field.length > 0;
  const lookup = posted ? buildField(field!.map((g) => ({ golfer: g, earnings: 0 })), aliases) : null;
  const state = (g: string): InField => (!lookup ? 'unknown' : lookup.get(g).inField ? 'in' : 'out');

  return FLIGHTS.map((flight) => {
    const { starter, alternate, weekSwap } = lineup[flight];
    const starterIn = state(starter);
    const alternateIn = state(alternate);
    let counts: string | null;
    let summary: WeekFlight['summary'];
    if (!posted) {
      counts = weekSwap ? alternate : starter;
      summary = 'pending';
    } else {
      const s = starterIn === 'in';
      const a = alternateIn === 'in';
      if (weekSwap && a) counts = alternate;
      else if (s) counts = starter;
      else if (a) counts = alternate;
      else counts = null;
      summary = s && a ? 'both' : s ? 'starter-in' : a ? 'alternate-in' : 'none';
    }
    return { flight, starter, alternate, weekSwap, starterIn, alternateIn, counts, summary };
  });
}
