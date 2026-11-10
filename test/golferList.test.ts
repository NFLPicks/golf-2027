import { expect, it } from 'vitest';
import { golferListText, parseGolferList } from '../src/lib/golferList';

it('parses comma and tab separated lines, any flight spelling', () => {
  const r = parseGolferList('Scottie Scheffler, Super Flight\nXander Schauffele\tA\n\nNicolai Højgaard, c\n');
  expect(r.errors).toEqual([]);
  expect(r.rows).toEqual([
    { name: 'Scottie Scheffler', flight: 'SUPER' },
    { name: 'Xander Schauffele', flight: 'A' },
    { name: 'Nicolai Højgaard', flight: 'C' },
  ]);
});

it('reports bad lines and duplicates', () => {
  const r = parseGolferList('Rory McIlroy, Z\nJustin Rose\nRory McIlroy, A\nrory mcilroy, B');
  expect(r.errors).toHaveLength(3);
  expect(r.rows).toEqual([{ name: 'Rory McIlroy', flight: 'A' }]);
});

it('round-trips', () => {
  const g = [{ name: 'A Golfer', flight: 'SUPER' as const }, { name: 'B Golfer', flight: 'E' as const }];
  expect(parseGolferList(golferListText(g)).rows).toEqual(g);
});
