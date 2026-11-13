import { describe, expect, it } from 'vitest';
import fixture from './fixtures/season2026.json';
import {
  FLIGHTS,
  buildField,
  lineupAt,
  normalizeName,
  scoreSeason,
  scoreTournament,
  type Flight,
  type ResultRow,
  type Roster,
  type Swap,
} from '../src/lib/scoring';

const slots = (s: string, a: string) =>
  Object.fromEntries(FLIGHTS.map((f) => [f, { starter: `${s}-${f}`, alternate: `${a}-${f}` }])) as Roster['slots'];
const roster: Roster = { owner: 'Pat', slots: slots('Star', 'Alt') };

describe('flight rules', () => {
  it('counts the starter when in the field', () => {
    const t = scoreTournament(1, [roster], [], buildField([{ golfer: 'Star-A', earnings: 100 }, { golfer: 'Alt-A', earnings: 900 }]));
    const a = t.scores[0].picks.find((p) => p.flight === 'A')!;
    expect(a).toMatchObject({ counted: 'Star-A', role: 'starter', earnings: 100 });
  });

  it('uses the alternate automatically when the starter is not in the field', () => {
    const t = scoreTournament(1, [roster], [], buildField([{ golfer: 'Alt-A', earnings: 900 }]));
    expect(t.scores[0].picks.find((p) => p.flight === 'A')).toMatchObject({ counted: 'Alt-A', role: 'alternate', earnings: 900 });
  });

  it('a starter who misses the cut counts $0 and the alternate is not used', () => {
    const t = scoreTournament(1, [roster], [], buildField([{ golfer: 'Star-A', earnings: null }, { golfer: 'Alt-A', earnings: 900 }]));
    expect(t.scores[0].picks.find((p) => p.flight === 'A')).toMatchObject({ counted: 'Star-A', earnings: 0 });
  });

  it('counts nothing when neither golfer plays', () => {
    const t = scoreTournament(1, [roster], [], buildField([]));
    expect(t.scores[0].total).toBe(0);
    expect(t.winners).toEqual([]);
  });
});

describe('swaps', () => {
  const field = buildField([{ golfer: 'Star-B', earnings: 10 }, { golfer: 'Alt-B', earnings: 20 }]);

  it('a one-week swap applies only to that tournament', () => {
    const swaps: Swap[] = [{ tournamentId: 2, owner: 'Pat', flight: 'B', kind: 'week' }];
    const b = (id: number) => scoreTournament(id, [roster], swaps, field).scores[0].picks.find((p) => p.flight === 'B')!;
    expect(b(1).counted).toBe('Star-B');
    expect(b(2).counted).toBe('Alt-B');
    expect(b(3).counted).toBe('Star-B');
  });

  it('a one-week swap falls back to the starter if the alternate is not in the field', () => {
    const swaps: Swap[] = [{ tournamentId: 2, owner: 'Pat', flight: 'B', kind: 'week' }];
    const t = scoreTournament(2, [roster], swaps, buildField([{ golfer: 'Star-B', earnings: 10 }]));
    expect(t.scores[0].picks.find((p) => p.flight === 'B')!.counted).toBe('Star-B');
  });

  it('a permanent swap holds until swapped back', () => {
    const swaps: Swap[] = [
      { tournamentId: 2, owner: 'Pat', flight: 'B', kind: 'permanent' },
      { tournamentId: 5, owner: 'Pat', flight: 'B', kind: 'permanent' },
    ];
    expect(lineupAt(roster, swaps, 1).B.starter).toBe('Star-B');
    expect(lineupAt(roster, swaps, 2).B.starter).toBe('Alt-B');
    expect(lineupAt(roster, swaps, 4).B.starter).toBe('Alt-B');
    expect(lineupAt(roster, swaps, 5).B.starter).toBe('Star-B');
  });

  it('only affects the swapped flight and owner', () => {
    const swaps: Swap[] = [{ tournamentId: 1, owner: 'Someone else', flight: 'B', kind: 'permanent' }];
    expect(lineupAt(roster, swaps, 1).B.starter).toBe('Star-B');
  });
});

describe('names', () => {
  it('matches accents and punctuation', () => {
    expect(normalizeName('Nicolai Højgaard')).toBe(normalizeName('Nicolai Hojgaard'));
    expect(normalizeName('Ludvig Åberg')).toBe(normalizeName('Ludvig Aberg'));
    expect(normalizeName('J.J. Spaun')).toBe(normalizeName('JJ Spaun'));
    expect(normalizeName(' Aaron  Wise ')).toBe('aaron wise');
  });
  it('supports aliases', () => {
    const f = buildField([{ golfer: 'Matthew Fitzpatrick', earnings: 5 }], { 'Matthew Fitzpatrick': 'Matt Fitzpatrick' });
    expect(f.get('Matt Fitzpatrick')).toEqual({ inField: true, earnings: 5 });
  });
});

describe('ties', () => {
  it('shares the weekly win on a tie', () => {
    const r2: Roster = { owner: 'Lee', slots: slots('Star', 'Alt') };
    const t = scoreTournament(1, [roster, r2], [], buildField([{ golfer: 'Star-A', earnings: 50 }]));
    expect(t.winners).toEqual(['Pat', 'Lee']);
  });
});

// ---- Full 2026 season replay against the commissioner's spreadsheet ----
type Fx = {
  rosters: Roster[];
  swaps: Swap[];
  results: Record<string, ResultRow[]>;
  sheetLeaderBoard: Record<string, Record<Flight, number>>;
  expectedCorrect: Record<string, Record<Flight, number>>;
  expectedWeekly: Record<string, Record<string, number>>;
};
const fx = fixture as unknown as Fx;
const season = scoreSeason({
  rosters: fx.rosters,
  swaps: fx.swaps,
  results: Object.fromEntries(Object.entries(fx.results).map(([k, v]) => [Number(k), v])),
});

// Owners whose sheet totals were affected by known spreadsheet errors
// (swap rows with broken codes, and Aaron Wise / Séamus Power earnings never matching).
const SHEET_ERRORS = new Set(['Owner 04', 'Owner 06', 'Owner 07', 'Owner 09', 'Owner 10', 'Owner 14', 'Owner 15']);

describe('2026 season replay', () => {
  it('matches the spreadsheet to the dollar for every owner unaffected by sheet errors', () => {
    let checked = 0;
    for (const row of season.standings) {
      if (SHEET_ERRORS.has(row.owner)) continue;
      for (const f of FLIGHTS) expect(row.byFlight[f], `${row.owner} ${f}`).toBeCloseTo(fx.sheetLeaderBoard[row.owner][f], 2);
      checked++;
    }
    expect(checked).toBe(8);
  });

  it('matches the independent corrected calculation for every owner and flight', () => {
    for (const row of season.standings)
      for (const f of FLIGHTS) expect(row.byFlight[f], `${row.owner} ${f}`).toBeCloseTo(fx.expectedCorrect[row.owner][f], 2);
  });

  it('matches every weekly team total', () => {
    for (const t of season.tournaments)
      for (const s of t.scores) expect(s.total, `T${t.tournamentId} ${s.owner}`).toBeCloseTo(fx.expectedWeekly[t.tournamentId][s.owner], 2);
  });

  it('scores 34 tournaments', () => {
    expect(season.tournaments).toHaveLength(34);
  });
});

describe('tie-break: highest-earning golfer', () => {
  it('breaks a weekly tie by the bigger single golfer', () => {
    const r1: Roster = { owner: 'Pat', slots: slots('Star', 'Alt') };
    const r2: Roster = { owner: 'Lee', slots: slots('Star', 'Alt') };
    // Pat: 60 + 40 = 100 (best 60). Lee: 70 + 30 = 100 (best 70) -> Lee wins.
    r1.slots.SUPER = { starter: 'P1', alternate: 'x1' };
    r1.slots.A = { starter: 'P2', alternate: 'x2' };
    r2.slots.SUPER = { starter: 'L1', alternate: 'y1' };
    r2.slots.A = { starter: 'L2', alternate: 'y2' };
    const field = buildField([
      { golfer: 'P1', earnings: 60 }, { golfer: 'P2', earnings: 40 },
      { golfer: 'L1', earnings: 70 }, { golfer: 'L2', earnings: 30 },
    ]);
    expect(scoreTournament(1, [r1, r2], [], field).winners).toEqual(['Lee']);
    const s = scoreSeason({ rosters: [r1, r2], swaps: [], results: { 1: [
      { golfer: 'P1', earnings: 60 }, { golfer: 'P2', earnings: 40 }, { golfer: 'L1', earnings: 70 }, { golfer: 'L2', earnings: 30 },
    ] } });
    expect(s.standings.map((r) => [r.owner, r.rank])).toEqual([['Lee', 1], ['Pat', 2]]);
  });
});
