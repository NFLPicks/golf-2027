import { describe, expect, it } from 'vitest';
import { weekStatus } from '../src/lib/fieldStatus';
import { parseField } from '../src/lib/fieldParse';
import { imageSlug } from '../src/lib/images';
import { easternToIso, parseDate, parseSchedule, parseTime } from '../src/lib/scheduleParse';
import { FLIGHTS, type Roster, type Swap } from '../src/lib/scoring';

const roster: Roster = {
  owner: 'Pat',
  slots: Object.fromEntries(FLIGHTS.map((f) => [f, { starter: `Star ${f}`, alternate: `Alt ${f}` }])) as Roster['slots'],
};
const B = (rows: ReturnType<typeof weekStatus>) => rows.find((r) => r.flight === 'B')!;

describe('weekStatus (Home: who is playing and who counts)', () => {
  it('UAT-HOME-01: both in the field, the starter counts', () => {
    const r = B(weekStatus(roster, [], 6, ['Star B', 'Alt B']));
    expect(r).toMatchObject({ starterIn: 'in', alternateIn: 'in', counts: 'Star B', summary: 'both' });
  });
  it('UAT-HOME-02: starter out, alternate in, the alternate counts automatically', () => {
    const r = B(weekStatus(roster, [], 6, ['Alt B']));
    expect(r).toMatchObject({ starterIn: 'out', alternateIn: 'in', counts: 'Alt B', summary: 'alternate-in' });
  });
  it('UAT-HOME-03: neither in the field, nobody counts', () => {
    const r = B(weekStatus(roster, [], 6, ['Someone Else']));
    expect(r).toMatchObject({ starterIn: 'out', alternateIn: 'out', counts: null, summary: 'none' });
  });
  it('UAT-HOME-04: field not posted yet', () => {
    const r = B(weekStatus(roster, [], 6, []));
    expect(r).toMatchObject({ starterIn: 'unknown', alternateIn: 'unknown', counts: 'Star B', summary: 'pending' });
  });
  it('a this-week swap counts the alternate, but falls back to the starter if the alternate is out', () => {
    const swaps: Swap[] = [{ owner: 'Pat', tournamentId: 6, flight: 'B', kind: 'week' }];
    expect(B(weekStatus(roster, swaps, 6, ['Star B', 'Alt B'])).counts).toBe('Alt B');
    expect(B(weekStatus(roster, swaps, 6, ['Star B'])).counts).toBe('Star B');
    expect(B(weekStatus(roster, swaps, 6, null)).counts).toBe('Alt B');
  });
  it('a permanent swap from an earlier week flips starter and alternate', () => {
    const swaps: Swap[] = [{ owner: 'Pat', tournamentId: 3, flight: 'B', kind: 'permanent' }];
    expect(B(weekStatus(roster, swaps, 6, ['Star B', 'Alt B']))).toMatchObject({ starter: 'Alt B', counts: 'Alt B' });
  });
  it('matches accents and aliases', () => {
    const r: Roster = { ...roster, slots: { ...roster.slots, B: { starter: 'Seamus Power', alternate: 'Matt Fitzpatrick' } } };
    const out = B(weekStatus(r, [], 6, ['Séamus Power', 'Matthew Fitzpatrick'], { 'Matthew Fitzpatrick': 'Matt Fitzpatrick' }));
    expect(out).toMatchObject({ starterIn: 'in', alternateIn: 'in' });
  });
});

describe('parseField', () => {
  it('reads one name per line, drops amateur marks and duplicates', () => {
    expect(parseField('Scottie Scheffler\nNick Dunlap (a)\n\nscottie scheffler\n').names).toEqual(['Scottie Scheffler', 'Nick Dunlap']);
  });
  it('reads rows copied from a tee-time table', () => {
    const text = 'TEE TIME\tPLAYER\tCOUNTRY\n7:40 AM\tJordan Spieth\tUSA\n7:51 AM\tLudvig Åberg\tSWE';
    expect(parseField(text).names).toEqual(['Jordan Spieth', 'Ludvig Åberg']);
  });
});

describe('imageSlug (matches the R image script)', () => {
  it.each([
    ['Scottie Scheffler', 'scottie-scheffler'],
    ['Séamus Power', 'seamus-power'],
    ['Nicolai Højgaard', 'nicolai-hojgaard'],
    ['AT&T Pebble Beach Pro-Am', 'at-t-pebble-beach-pro-am'],
    ['3M Open', '3m-open'],
  ])('%s -> %s', (name, slug) => expect(imageSlug(name)).toBe(slug));
});

describe('schedule parsing', () => {
  it('reads dates and times in common formats', () => {
    expect(parseDate('2027-02-04')).toBe('2027-02-04');
    expect(parseDate('2/4/2027')).toBe('2027-02-04');
    expect(parseDate('2/4/27')).toBe('2027-02-04');
    expect(parseDate('Feb 4, 2027')).toBe('2027-02-04');
    expect(parseDate('February 7', 2027)).toBe('2027-02-07');
    expect(parseDate('soon')).toBeNull();
    expect(parseTime('7:40 AM')).toBe('07:40');
    expect(parseTime('1:05 pm')).toBe('13:05');
    expect(parseTime('7am')).toBe('07:00');
  });
  it('converts Eastern time to UTC across daylight saving', () => {
    expect(easternToIso('2027-02-04', '07:00')).toBe('2027-02-04T12:00:00.000Z'); // EST
    expect(easternToIso('2027-07-15', '07:00')).toBe('2027-07-15T11:00:00.000Z'); // EDT
  });
  it('reads a pasted schedule with a header row', () => {
    const text = [
      "Event\tStart\tEnd\tCourse\tLocation\tPurse\tLast year's champion",
      'WM Phoenix Open\t2/4/2027\t2/7/2027\tTPC Scottsdale\tScottsdale, AZ\t$9,800,000\tThomas Detry',
      'The Genesis Invitational\tFeb 18, 2027\t\tRiviera\tLos Angeles, CA\t$20M\t',
    ].join('\n');
    const r = parseSchedule(text, { firstId: 6 });
    expect(r.warnings).toEqual([]);
    expect(r.rows[0]).toEqual({
      id: 6, name: 'WM Phoenix Open', start: '2027-02-04', end: '2027-02-07', lockAt: '2027-02-04T12:00:00.000Z',
      purse: 9800000, course: 'TPC Scottsdale', location: 'Scottsdale, AZ', champion: 'Thomas Detry', logo: null,
    });
    expect(r.rows[1]).toMatchObject({ id: 7, start: '2027-02-18', end: null, purse: 20000000, champion: null });
  });
  it('uses the # and Lock columns when given, and explains bad rows', () => {
    const text = '#\tEvent\tStart\tLock\n12\tTHE PLAYERS\t3/11/2027\t6:45 AM\n13\tValspar\tnext week\t';
    const r = parseSchedule(text);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ id: 12, lockAt: '2027-03-11T11:45:00.000Z' }); // still EST: DST starts Mar 14, 2027
    expect(r.warnings[0]).toMatch(/Valspar: couldn't read the start date/);
  });
  it('asks for a header row', () => {
    expect(parseSchedule('WM Phoenix Open\t2/4/2027').warnings[0]).toMatch(/column names/);
  });
});

describe('event logo fallbacks', () => {
  it('drops sponsor tails so the short file name still matches', async () => {
    const { withoutSponsor, eventLogoUrls } = await import('../src/lib/images');
    expect(withoutSponsor('Arnold Palmer Invitational pres. by Mastercard')).toBe('Arnold Palmer Invitational');
    expect(withoutSponsor('the Memorial Tournament presented by Workday')).toBe('the Memorial Tournament');
    expect(withoutSponsor('WM Phoenix Open')).toBe('WM Phoenix Open');
    const urls = eventLogoUrls({ name: 'Arnold Palmer Invitational pres. by Mastercard', logo: 'api.png' });
    expect(urls.map((u) => u.split('/events/')[1])).toEqual([
      'api.png', 'arnold-palmer-invitational-pres-by-mastercard.png', 'arnold-palmer-invitational.png',
    ]);
  });
});
