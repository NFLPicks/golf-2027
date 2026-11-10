import { useMemo } from 'react';
import type { League } from '../lib/api';
import { money } from '../lib/league';
import { FLIGHTS, FLIGHT_LABELS, scoreSeason } from '../lib/scoring';
import { store } from '../storage';

export default function Standings({ league }: { league: League }) {
  const season = useMemo(
    () => scoreSeason({ rosters: league.rosters, swaps: league.swaps, results: league.results, aliases: league.aliases }),
    [league],
  );
  const me = store.get('owner');
  const byId = new Map(league.tournaments.map((t) => [t.id, t]));
  const last = [...season.tournaments].reverse().find((t) => t.winners.length);

  if (!league.rosters.length) return <div className="card muted">Rosters haven't been entered yet.</div>;

  return (
    <>
      {last && (
        <div className="card">
          <h2>Latest: {byId.get(last.tournamentId)?.name}</h2>
          <div>
            🏆 <b>{last.winners.join(' & ')}</b> {last.winners.length > 1 ? 'tie' : 'wins'} the week with {money(last.topTotal)}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Season standings</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th className="l">Owner</th>
                <th>Total</th>
                <th>Behind</th>
                {FLIGHTS.map((f) => <th key={f}>{FLIGHT_LABELS[f]}</th>)}
                <th>Wks won</th>
              </tr>
            </thead>
            <tbody>
              {season.standings.map((r) => (
                <tr key={r.owner} className={r.owner === me ? 'me' : ''}>
                  <td>{r.rank}</td>
                  <td className="l">{r.owner}</td>
                  <td><b>{money(r.total)}</b></td>
                  <td className="muted">{r.behindFirst ? money(r.behindFirst) : '—'}</td>
                  {FLIGHTS.map((f) => (
                    <td key={f} className={season.flightLeaders[f].owners.includes(r.owner) && r.byFlight[f] > 0 ? 'lead' : ''}>
                      {money(r.byFlight[f])}
                    </td>
                  ))}
                  <td>{r.weeklyWins || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">Gold = current flight leader.</p>
      </div>

      {season.tournaments.length > 0 && (
        <div className="card">
          <h2>Weekly winners</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th className="l">Tournament</th><th className="l">Winner</th><th>Earned</th></tr></thead>
              <tbody>
                {[...season.tournaments].reverse().map((t) => (
                  <tr key={t.tournamentId}>
                    <td className="l">{byId.get(t.tournamentId)?.name ?? `#${t.tournamentId}`}</td>
                    <td className="l">{t.winners.join(' & ') || '—'}</td>
                    <td>{money(t.topTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
