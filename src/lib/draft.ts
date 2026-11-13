import type { DraftPick } from './api';
import { FLIGHTS, type Flight } from './scoring';

export interface Slot { starter: string | null; alternate: string | null }
export type Draft = Record<Flight, Slot>;

export const emptyDraft = (): Draft => Object.fromEntries(FLIGHTS.map((f) => [f, { starter: null, alternate: null }])) as Draft;

export function toDraft(picks: DraftPick[]): Draft {
  const d = emptyDraft();
  for (const p of picks) if (d[p.flight]) d[p.flight] = { starter: p.starter, alternate: p.alternate };
  return d;
}

/**
 * Tapping a golfer in a flight: tap a picked golfer to drop him (the alternate moves up if the starter is dropped);
 * otherwise he fills the starter spot first, then the alternate; with both full he replaces the alternate.
 */
export function tapGolfer(slot: Slot, golfer: string): Slot {
  if (slot.starter === golfer) return { starter: slot.alternate, alternate: null };
  if (slot.alternate === golfer) return { starter: slot.starter, alternate: null };
  if (!slot.starter) return { starter: golfer, alternate: slot.alternate };
  return { starter: slot.starter, alternate: golfer };
}

export const flipSlot = (slot: Slot): Slot => ({ starter: slot.alternate, alternate: slot.starter });
export const slotDone = (slot: Slot) => Boolean(slot.starter && slot.alternate);
export const flightsDone = (d: Draft) => FLIGHTS.filter((f) => slotDone(d[f])).length;
