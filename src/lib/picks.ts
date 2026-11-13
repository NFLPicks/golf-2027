import type { MySwap } from './api';
import { FLIGHT_LABELS, FLIGHTS, lineupAt, type Flight, type Roster, type Swap, type SwapKind } from './scoring';

export type Choice = 'keep' | SwapKind;
export type Choices = Record<Flight, Choice>;

/** The choices already saved for one tournament ("keep" where there's no swap). */
export function savedChoices(mySwaps: MySwap[], tournamentId: number): Choices {
  return Object.fromEntries(
    FLIGHTS.map((f) => [f, mySwaps.find((s) => s.tournamentId === tournamentId && s.flight === f)?.kind ?? 'keep']),
  ) as Choices;
}

/** My swaps with this tournament's choices replaced by the draft, in the shape scoring uses. */
export function draftSwaps(owner: string, mySwaps: MySwap[], tournamentId: number, draft: Choices): Swap[] {
  const others = mySwaps.filter((s) => s.tournamentId !== tournamentId).map((s) => ({ ...s, owner }));
  const mine = FLIGHTS.filter((f) => draft[f] !== 'keep').map((f) => ({
    owner, tournamentId, flight: f, kind: draft[f] as SwapKind,
  }));
  return [...others, ...mine];
}

export interface Change { flight: Flight; kind: SwapKind | null; text: string }

/**
 * What Submit will save, in plain words, e.g. "Flight A: Jordan Spieth starts this week only".
 * `before` = starter/alternate going into this tournament (earlier permanent swaps applied).
 */
export function changesFor(roster: Roster, mySwaps: MySwap[], tournamentId: number, draft: Choices): Change[] {
  const saved = savedChoices(mySwaps, tournamentId);
  const before = lineupAt(roster, mySwaps.filter((s) => s.tournamentId < tournamentId).map((s) => ({ ...s, owner: roster.owner })), tournamentId);
  return FLIGHTS.filter((f) => draft[f] !== saved[f]).map((f) => {
    const { starter, alternate } = before[f];
    const label = f === 'SUPER' ? 'Super' : `Flight ${FLIGHT_LABELS[f]}`;
    const text =
      draft[f] === 'keep' ? `${label}: ${starter} back as starter`
        : draft[f] === 'week' ? `${label}: ${alternate} starts this week only`
          : `${label}: ${alternate} starts from now on`;
    return { flight: f, kind: draft[f] === 'keep' ? null : (draft[f] as SwapKind), text };
  });
}
