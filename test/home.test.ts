import { describe, expect, it } from 'vitest';
import type { LeagueTournament } from '../src/lib/api';
import { calendarSections, currentTournament, dateRange, golferMoney, timeLeft } from '../src/lib/home';
import { FLIGHTS, scoreSeason, type Roster } from '../src/lib/scoring';

const T = (id: number, start: string, extra: Partial<LeagueTournament> = {}): LeagueTournament => ({
  id, name: `Event ${id}`, start_date: start, lock_at: `${start}T12:00:00Z`, purse: null, field_url: null, status: 'upcoming', ...extra,
});
const ts = [
  T(5, '2027-01-29', { status: 'final' }),
  T(6, '2027-02-05', { end_date: '2027-02-08' }),
  T(7, '2027-02-05', { name: 'Opposite-field event' }),
  T(8, '2027-02-12'),
];

describe('which tournament Home shows', () => {
  it('shows this week while it is being played, including Sunday', () => {
    expect(currentTournament(ts, new Date('2027-02-06T18:00:00Z'))?.id).toBe(6);
    expect(currentTournament(ts, new Date('2027-02-08T23:00:00Z'))?.id).toBe(6);
  });
  it('moves to next week once this week is over, even before results are final', () => {
    expect(currentTournament(ts, new Date('2027-02-09T15:00:00Z'))?.id).toBe(8);
  });
  it('shows the next event in the off-season, and the last one after the season', () => {
    expect(currentTournament(ts.map((t) => ({ ...t, status: 'upcoming' as const })), new Date('2026-12-01T00:00:00Z'))?.id).toBe(5);
    expect(currentTournament(ts, new Date('2027-12-01T00:00:00Z'))?.id).toBe(8);
  });
});

describe('calendar sections', () => {
  it('puts both events of a two-event week under This week', () => {
    const s = calendarSections(ts, new Date('2027-02-06T18:00:00Z'));
    expect(s.past.map((t) => t.id)).toEqual([5]);
    expect(s.thisWeek.map((t) => t.id)).toEqual([6, 7]);
    expect(s.upcoming.map((t) => t.id)).toEqual([8]);
  });
  it('leaves This week empty in the off-season', () => {
    const s = calendarSections(ts.slice(1), new Date('2026-11-13T18:00:00Z'));
    expect(s.thisWeek).toEqual([]);
    expect(s.upcoming.map((t) => t.id)).toEqual([6, 7, 8]);
  });
});

describe('formatting', () => {
  it('date ranges', () => {
    expect(dateRange(T(1, '2027-02-05', { end_date: '2027-02-08' }))).toBe('FEB 5–8');
    expect(dateRange(T(1, '2027-07-31', { end_date: '2027-08-03' }))).toBe('JUL 31–AUG 3');
    expect(dateRange(T(1, '2027-02-05'))).toBe('FEB 5');
  });
  it('time left until the lock', () => {
    const now = new Date('2027-02-03T19:00:00Z');
    expect(timeLeft('2027-02-05T09:00:00Z', now)).toBe('1d 14h left');
    expect(timeLeft('2027-02-03T22:20:00Z', now)).toBe('3h 20m left');
    expect(timeLeft('2027-02-03T18:00:00Z', now)).toBe('');
  });
});

describe('golfer money on Home (PGA $ and For you $)', () => {
  // Rahm starts, Spieth is the alternate. Week 1 both play: only Rahm counts for you.
  // Week 2 Rahm is out: Spieth counts. Week 3 Rahm misses the cut: $0 and Spieth's money doesn't count.
  const roster: Roster = {
    owner: 'Pat',
    slots: Object.fromEntries(FLIGHTS.map((f) => [f, { starter: `S ${f}`, alternate: `A ${f}` }])) as Roster['slots'],
  };
  roster.slots.A = { starter: 'Jon Rahm', alternate: 'Jordan Spieth' };
  const results = {
    1: [{ golfer: 'Jon Rahm', earnings: 1000 }, { golfer: 'Jordan Spieth', earnings: 500 }],
    2: [{ golfer: 'Jordan Spieth', earnings: 300 }],
    3: [{ golfer: 'Jon Rahm', earnings: null }, { golfer: 'Jordan Spieth', earnings: 700 }],
  };
  const season = scoreSeason({ rosters: [roster], swaps: [], results });
  const m = golferMoney(['Jon Rahm', 'Jordan Spieth'], 'Pat', results, season);
  it('PGA $ is everything he won; For you $ is only the weeks he counted', () => {
    expect(m.get('Jon Rahm')).toEqual({ pga: 1000, mine: 1000 });
    expect(m.get('Jordan Spieth')).toEqual({ pga: 1500, mine: 300 });
  });
});
