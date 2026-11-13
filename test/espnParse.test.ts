import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { espnEventId, parseEspnLeaderboard } from '../src/lib/espnParse';
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
