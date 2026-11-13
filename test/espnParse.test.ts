import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { autoSaveProblem, dueForField, dueForImport, espnFieldNames, espnEventId, espnEvents, matchEspnEvent, parseEspnLeaderboard } from '../src/lib/espnParse';
import { buildField } from '../src/lib/scoring';

const load = (f: string) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));

describe('ESPN leaderboard import', () => {
  it('reads a cut event: everyone is in the field, cuts earn nothing', () => {
    const r = parseEspnLeaderboard(load('espn-cut.json'));
    expect(r.name).toBe('THE PLAYERS Championship');
    expect(r.final).toBe(true);
    expect(r.rows).toHaveLength(123);
    expect(r.rows.filter((x) => x.earnings !== null)).toHaveLength(73);
    expect(r.rows.find((x) => x.golfer === 'Denny McCarthy')).toEqual({ golfer: 'Denny McCarthy', earnings: null, position: 'CUT' });
    expect(r.rows.find((x) => x.golfer === 'Zach Bauchou')).toMatchObject({ earnings: 61083, position: 'T50' });
    expect(r.rows[0].position).toBe('1');
    expect(r.purse).toBe(25_000_000);
    expect(r.paid).toBeGreaterThan(24_000_000);
    expect(r.warnings).toEqual([]);
    // Cut golfers count as in the field ($0), so their alternate does not step in.
    expect(buildField(r.rows).get('Denny McCarthy')).toEqual({ inField: true, earnings: 0 });
  });

  it('reads a no-cut event', () => {
    const r = parseEspnLeaderboard(load('espn-nocut.json'));
    expect(r.name).toBe('Baycurrent Classic');
    expect(r.rows).toHaveLength(72);
    // Only the amateur goes unpaid.
    expect(r.rows.filter((x) => x.earnings === null).map((x) => x.golfer)).toEqual(['Koshin Nagasaki']);
    expect(Math.abs(r.paid - 8_000_000)).toBeLessThan(400_000);
  });

  it('warns when the event is not final', () => {
    const j = load('espn-nocut.json');
    j.events[0].status.type = { name: 'STATUS_IN_PROGRESS', completed: false };
    expect(parseEspnLeaderboard(j).warnings[0]).toMatch(/not.*final|final yet/);
  });

  it('rejects something that is not a leaderboard', () => {
    expect(() => parseEspnLeaderboard({ hello: 1 })).toThrow(/ESPN leaderboard/);
  });

  it('finds the event ID in a link or plain number', () => {
    expect(espnEventId('401811937')).toBe('401811937');
    expect(espnEventId('https://www.espn.com/golf/leaderboard/_/tournamentId/401811937')).toBe('401811937');
    expect(espnEventId('https://www.espn.com/golf/leaderboard?tournamentId=401811937')).toBe('401811937');
    expect(espnEventId('players')).toBeNull();
  });
});

describe('automatic import', () => {
  const scoreboard = {
    leagues: [{ calendar: [
      { id: '401811937', label: 'THE PLAYERS Championship', startDate: '2027-03-11T07:00Z', endDate: '2027-03-14T07:00Z' },
      { event: { $ref: 'http://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/401811938?lang=en' }, label: 'Valspar Championship', startDate: '2027-03-18T07:00Z', endDate: '2027-03-21T07:00Z' },
      { id: '401811950', label: 'Puntacana Championship', startDate: '2027-03-18T07:00Z', endDate: '2027-03-21T07:00Z' },
    ] }],
    events: [{ id: '401811937', name: 'THE PLAYERS Championship', date: '2027-03-11T11:00Z', endDate: '2027-03-14T23:00Z' }],
  };

  it('lists ESPN events from the calendar and events, once each', () => {
    const ev = espnEvents(scoreboard);
    expect(ev.map((e) => e.id)).toEqual(['401811937', '401811938', '401811950']);
    expect(ev[0]).toEqual({ id: '401811937', name: 'THE PLAYERS Championship', start: '2027-03-11', end: '2027-03-14' });
    // A leaderboard response works too.
    expect(espnEvents(load('espn-cut.json'))).toEqual([]); // trimmed fixture has no dates
  });

  it('matches by dates, and by name when two events share a week', () => {
    const ev = espnEvents(scoreboard);
    expect(matchEspnEvent({ name: 'The Players Championship', start: '2027-03-11', end: '2027-03-14' }, ev)?.id).toBe('401811937');
    expect(matchEspnEvent({ name: 'Valspar Championship', start: '2027-03-18', end: '2027-03-21' }, ev)?.id).toBe('401811938');
    expect(matchEspnEvent({ name: 'Some Other Open', start: '2027-03-18', end: '2027-03-21' }, ev)).toBeNull();
    expect(matchEspnEvent({ name: 'Masters Tournament', start: '2027-04-08', end: '2027-04-11' }, ev)).toBeNull();
    // Renamed sponsor but same dates and only one event that week: still matched.
    expect(matchEspnEvent({ name: 'Cognizant Classic in The Palm Beaches', start: '2027-03-11', end: '2027-03-14' }, ev)?.id).toBe('401811937');
  });

  it('only auto-saves final results whose money is close to the purse', () => {
    const r = parseEspnLeaderboard(load('espn-cut.json'));
    expect(autoSaveProblem(r, 25_000_000)).toBeNull();
    expect(autoSaveProblem(r, 9_900_000)).toMatch(/far from the purse/);
    expect(autoSaveProblem({ ...r, final: false }, null)).toMatch(/final/);
  });

  it('picks finished, unscored events from the last three weeks', () => {
    const ts = [
      { id: 1, status: 'final', start_date: '2027-03-04' },
      { id: 2, status: 'upcoming', start_date: '2027-03-11', end_date: '2027-03-14' },
      { id: 3, status: 'upcoming', start_date: '2027-03-18' },
      { id: 4, status: 'upcoming', start_date: '2027-01-07' },
    ];
    expect(dueForImport(ts, '2027-03-16').map((t) => t.id)).toEqual([2]);
    expect(dueForImport(ts, '2027-03-22').map((t) => t.id)).toEqual([2, 3]);
  });
});

describe('weekly field', () => {
  it('lists the field, leaving out withdrawals', () => {
    const j = load('espn-nocut.json');
    const c = j.events[0].competitions[0].competitors;
    c[1].status.type.name = 'STATUS_WD';
    c.push({ ...c[0] }); // duplicate
    const names = espnFieldNames(j);
    expect(names).toHaveLength(71);
    expect(names).not.toContain(c[1].athlete.displayName);
    expect(names[0]).toBe(c[0].athlete.displayName);
  });

  it('picks events starting today through the next 6 days', () => {
    const ts = [
      { id: 1, status: 'upcoming', start_date: '2027-01-15' },
      { id: 2, status: 'upcoming', start_date: '2027-01-21' },
      { id: 3, status: 'upcoming', start_date: '2027-01-28' },
      { id: 4, status: 'final', start_date: '2027-01-21' },
    ];
    expect(dueForField(ts, '2027-01-18').map((t) => t.id)).toEqual([2]);
    expect(dueForField(ts, '2027-01-21').map((t) => t.id)).toEqual([2]);
    expect(dueForField(ts, '2027-01-22').map((t) => t.id)).toEqual([3]);
  });
});
