import { describe, expect, it } from 'vitest';
import type { MySwap } from '../src/lib/api';
import { weekStatus } from '../src/lib/fieldStatus';
import { changesFor, draftSwaps, savedChoices } from '../src/lib/picks';
import { FLIGHTS, type Roster } from '../src/lib/scoring';

const roster: Roster = {
  owner: 'Pat',
  slots: Object.fromEntries(FLIGHTS.map((f) => [f, { starter: `Star ${f}`, alternate: `Alt ${f}` }])) as Roster['slots'],
};
const sw = (tournamentId: number, flight: MySwap['flight'], kind: MySwap['kind']): MySwap => ({ tournamentId, flight, kind, createdAt: '' });
const keepAll = () => savedChoices([], 6);

describe('Roster & Picks draft', () => {
  it('reads the saved choices for this tournament only', () => {
    const c = savedChoices([sw(6, 'A', 'week'), sw(5, 'B', 'permanent')], 6);
    expect(c.A).toBe('week');
    expect(c.B).toBe('keep');
  });

  it('lists only flights that changed, in plain words', () => {
    const draft = { ...keepAll(), A: 'week' as const, C: 'permanent' as const };
    expect(changesFor(roster, [], 6, draft).map((c) => c.text)).toEqual([
      'Flight A: Alt A starts this week only',
      'Flight C: Alt C starts from now on',
    ]);
  });

  it('undoing a saved swap says who goes back to starting', () => {
    const changes = changesFor(roster, [sw(6, 'B', 'week')], 6, keepAll());
    expect(changes).toEqual([{ flight: 'B', kind: null, text: 'Flight B: Star B back as starter' }]);
  });

  it('uses the lineup after earlier permanent swaps', () => {
    const changes = changesFor(roster, [sw(3, 'D', 'permanent')], 6, { ...keepAll(), D: 'week' });
    expect(changes[0].text).toBe('Flight D: Star D starts this week only');
  });

  it('previews who counts with the draft applied (same rules as scoring)', () => {
    const field = ['Star A', 'Alt A', 'Star B'];
    const draft = { ...keepAll(), A: 'week' as const, B: 'week' as const };
    const flights = weekStatus(roster, draftSwaps('Pat', [], 6, draft), 6, field);
    expect(flights.find((f) => f.flight === 'A')!.counts).toBe('Alt A');
    // Alternate not in the field: the week swap falls back to the starter.
    expect(flights.find((f) => f.flight === 'B')!.counts).toBe('Star B');
  });
});
