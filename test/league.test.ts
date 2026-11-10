import { describe, expect, it } from 'vitest';
import { planFor } from '../src/lib/league';
import { FLIGHTS, type Roster, type Swap } from '../src/lib/scoring';

const roster: Roster = {
  owner: 'Pat',
  slots: Object.fromEntries(FLIGHTS.map((f) => [f, { starter: `S-${f}`, alternate: `A-${f}` }])) as Roster['slots'],
};

describe('planFor (My team screen)', () => {
  it('shows the starter playing with no swaps', () => {
    expect(planFor(roster, [], 3)[0]).toMatchObject({ playing: 'S-SUPER', bench: 'A-SUPER', choice: null });
  });
  it('a week swap only shows on its own tournament', () => {
    const swaps: Swap[] = [{ owner: 'Pat', tournamentId: 3, flight: 'SUPER', kind: 'week' }];
    expect(planFor(roster, swaps, 3)[0]).toMatchObject({ playing: 'A-SUPER', choice: 'week' });
    expect(planFor(roster, swaps, 4)[0]).toMatchObject({ playing: 'S-SUPER', choice: null });
  });
  it('a permanent swap carries into later tournaments', () => {
    const swaps: Swap[] = [{ owner: 'Pat', tournamentId: 3, flight: 'A', kind: 'permanent' }];
    expect(planFor(roster, swaps, 3)[1]).toMatchObject({ playing: 'A-A', choice: 'permanent' });
    expect(planFor(roster, swaps, 4)[1]).toMatchObject({ playing: 'A-A', bench: 'S-A', choice: null });
  });
});
