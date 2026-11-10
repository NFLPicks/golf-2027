import { describe, expect, it } from 'vitest';
import { nameCheck, parseLeaderboard } from '../src/lib/resultsParse';

const espn = [
  'POS\tPLAYER\tSCORE\tR1\tR2\tR3\tR4\tTOT\tEARNINGS\tFEDEX PTS',
  '1\tScottie Scheffler\t-16\t65\t67\t66\t66\t264\t$10,000,000\t750',
  'T4\tNicolai Højgaard\t-11\t68\t68\t67\t66\t269\t$1,707,143\t300',
  '\tT58\tEric Cole\t5\t72\t72\t70\t71\t285\t$44,400\t10', // extra leading cell
  'CUT\tMax Homa\t+5\t74\t73\t--\t--\t147\t--\t0',
  '-\tRobert MacIntyre\tWD\t82\t--\t--\t--\t82\t--\t0',
].join('\n');

describe('parseLeaderboard', () => {
  it('reads an ESPN leaderboard copied with tabs', () => {
    const r = parseLeaderboard(espn);
    expect(r.warnings).toEqual([]);
    expect(r.rows).toEqual([
      { golfer: 'Scottie Scheffler', earnings: 10000000, position: '1' },
      { golfer: 'Nicolai Højgaard', earnings: 1707143, position: 'T4' },
      { golfer: 'Eric Cole', earnings: 44400, position: 'T58' },
      { golfer: 'Max Homa', earnings: null, position: 'CUT' },
      { golfer: 'Robert MacIntyre', earnings: null, position: '-' },
    ]);
  });

  it('reads two columns pasted from Excel', () => {
    const r = parseLeaderboard('Scottie Scheffler\t10000000\nMax Homa\t--\n');
    expect(r.rows.map((x) => [x.golfer, x.earnings])).toEqual([['Scottie Scheffler', 10000000], ['Max Homa', null]]);
  });

  it('warns when there is no prize money at all', () => {
    expect(parseLeaderboard('Max Homa\t--').warnings[0]).toMatch(/No prize money/);
  });

  it('ignores duplicate names (first wins, like the old sheet)', () => {
    const r = parseLeaderboard('Rory McIlroy\t1,360,000\nRory McIlroy\t41,600');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].earnings).toBe(1360000);
  });
});

describe('nameCheck', () => {
  it('lists roster golfers missing from results with same-surname suggestions', () => {
    const res = [{ golfer: 'Matthew Fitzpatrick', earnings: 5 }, { golfer: 'Seamus Power', earnings: 1 }];
    const out = nameCheck(['Matt Fitzpatrick', 'Séamus Power', 'Tiger Woods'], res);
    expect(out).toEqual([
      { golfer: 'Matt Fitzpatrick', maybe: ['Matthew Fitzpatrick'] },
      { golfer: 'Tiger Woods', maybe: [] },
    ]);
  });
  it('respects aliases', () => {
    const res = [{ golfer: 'Matthew Fitzpatrick', earnings: 5 }];
    expect(nameCheck(['Matt Fitzpatrick'], res, { 'Matthew Fitzpatrick': 'Matt Fitzpatrick' })).toEqual([]);
  });
});
