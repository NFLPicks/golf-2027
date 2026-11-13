import { describe, expect, it } from 'vitest';
import { emptyDraft, flightsDone, flipSlot, tapGolfer, toDraft } from '../src/lib/draft';

describe('Build your team picks', () => {
  it('fills starter, then alternate, then replaces the alternate', () => {
    let s = emptyDraft().A;
    s = tapGolfer(s, 'Scottie');
    expect(s).toEqual({ starter: 'Scottie', alternate: null });
    s = tapGolfer(s, 'Rory');
    expect(s).toEqual({ starter: 'Scottie', alternate: 'Rory' });
    s = tapGolfer(s, 'Xander');
    expect(s).toEqual({ starter: 'Scottie', alternate: 'Xander' });
  });

  it('tapping a picked golfer drops him; the alternate moves up', () => {
    expect(tapGolfer({ starter: 'Scottie', alternate: 'Rory' }, 'Scottie')).toEqual({ starter: 'Rory', alternate: null });
    expect(tapGolfer({ starter: 'Scottie', alternate: 'Rory' }, 'Rory')).toEqual({ starter: 'Scottie', alternate: null });
  });

  it('flips starter and alternate, and counts finished flights', () => {
    expect(flipSlot({ starter: 'A', alternate: 'B' })).toEqual({ starter: 'B', alternate: 'A' });
    const d = toDraft([{ flight: 'A', starter: 'x', alternate: 'y' }, { flight: 'B', starter: 'z', alternate: null }]);
    expect(flightsDone(d)).toBe(1);
    expect(d.C).toEqual({ starter: null, alternate: null });
  });
});
