import { useMemo, useState } from 'react';
import type { League } from '../lib/api';
import { money } from '../lib/league';
import { FLIGHT_LABELS, FLIGHTS, scoreSeason, type SeasonResult } from '../lib/scoring';
import { store } from '../storage';

type Tab = 'season' | 'flights' | 'weekly' | 'payouts';
const TABS: [Tab, string][] = [['season', 'Season'], ['flights', 'Flights'], ['weekly', 'Weekly'], ['payouts', 'Payouts']];
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10] || 'th'}`;
const flightName = (f: string) => (f === 'SUPER' ? 'SUPER' : `FLIGHT ${f}`);

/** Standings: Season / Flights / Weekly / Payouts. Everything is computed from results; nothing is stored. */
export default function Standings({ league }: { league: League }) {
  const [tab, setTab] = useState<Tab>(() => (store.get('standingsTab') as Tab) || 'season');
  const me = store.get('owner');
  const input = { rosters: league.rosters, swaps: league.swaps, aliases: league.aliases };
  const season = useMemo(() => scoreSeason({ ...input, results: league.results }), [league]);
  // Rank movement: standings before the most recent scored tournament.
  const previous = useMemo(() => {
    const ids = Object.keys(league.results).map(Number).sort((a, b) => a - b);
    if (ids.length < 2) return null;
    const results = Object.fromEntries(ids.slice(0, -1).map((id) => [id, league.results[id]]));
    return scoreSeason({ ...input, results });
  }, [league]);

  if (!league.rosters.length) return <div className="card muted">Rosters haven't been entered yet.</div>;
  const pick = (t: Tab) => { setTab(t); store.set('standingsTab', t); };

  return (
    <>
      <div className="section-head"><h2>STANDINGS</h2></div>
      <div className="toggle" role="group" aria-label="Standings view" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {TABS.map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => pick(id)}>{label}</button>)}
      </div>
      {!season.tournaments.length && <div className="card muted">No results yet. Standings start after the first tournament.</div>}
      {tab === 'season' && <SeasonTab season={season} previous={previous} me={me} />}
      {tab === 'flights' && <FlightsTab season={season} me={me} />}
      {tab === 'weekly' && <WeeklyTab season={season} league={league} me={me} />}
      {tab === 'payouts' && <PayoutsTab season={season} league={league} me={me} />}
    </>
  );
}

const rowStyle = (mine: boolean) => ({ background: mine ? 'var(--brand-soft)' : undefined, fontWeight: mine ? 800 : undefined });

function SeasonTab({ season, previous, me }: { season: SeasonResult; previous: SeasonResult | null; me: string | null }) {
  return (
    <section className="fcard">
      {season.standings.map((r) => {
        const before = previous?.standings.find((x) => x.owner === r.owner)?.rank;
        const move = before === undefined ? 0 : before - r.rank;
        return (
          <div key={r.owner} className="grow" style={{ ...rowStyle(r.owner === me), gap: 10 }}>
            <span style={{ width: 22, fontWeight: 800 }}>{r.rank}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: r.owner === me ? 800 : 600 }}>{r.owner}</div>
              <div className="small muted">
                {r.rank === 1 && r.behindFirst === 0 ? 'Leader' : `${money(-r.behindFirst)} back`}
                {r.weeklyWins ? ` · ${r.weeklyWins} weekly win${r.weeklyWins > 1 ? 's' : ''}` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700 }}>{money(r.total)}</div>
              <div className="small" style={{ color: move > 0 ? 'var(--in-fg)' : move < 0 ? 'var(--out-fg)' : 'var(--muted)' }}>
                {move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : '–'}
              </div>
            </div>
          </div>
        );
      })}
      <p className="small muted" style={{ margin: 0, padding: '6px 10px 8px' }}>Ties go to the owner whose best golfer has earned more.</p>
    </section>
  );
}

function FlightsTab({ season, me }: { season: SeasonResult; me: string | null }) {
  return (
    <>
      {FLIGHTS.map((f) => {
        const leaders = season.flightLeaders[f].owners;
        // Leaders (after the tie-break) first, then by amount. Same amount = same place, except the tie-break decides 1st.
        const ranked = [...season.standings].sort(
          (a, b) => Number(leaders.includes(b.owner)) - Number(leaders.includes(a.owner)) || b.byFlight[f] - a.byFlight[f],
        );
        const place = (owner: string) => {
          if (leaders.includes(owner)) return 1;
          const amt = ranked.find((r) => r.owner === owner)!.byFlight[f];
          return 1 + ranked.filter((r) => r.byFlight[f] > amt + 0.005 || leaders.includes(r.owner)).length;
        };
        const anyMoney = season.flightLeaders[f].total > 0;
        const myPlace = me && anyMoney && ranked.some((r) => r.owner === me) ? place(me) : 0;
        return (
          <section className="fcard" key={f} aria-label={`${FLIGHT_LABELS[f]} flight`}>
            <div className="fhead">
              <span className="fname">{flightName(f)}</span>
              {myPlace > 0 && <span className="tag">YOU: {ordinal(myPlace).toUpperCase()}</span>}
            </div>
            {!anyMoney && <div className="grow small muted">No money in this flight yet.</div>}
            {anyMoney && ranked.slice(0, 3).map((r) => (
              <div key={r.owner} className="grow" style={rowStyle(r.owner === me)}>
                <span style={{ width: 22, fontWeight: 800 }}>{place(r.owner)}</span>
                <span style={{ flex: 1 }}>{r.owner}{leaders.includes(r.owner) ? ' 🏆' : ''}</span>
                <b>{money(r.byFlight[f])}</b>
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}

function WeeklyTab({ season, league, me }: { season: SeasonResult; league: League; me: string | null }) {
  const byId = new Map(league.tournaments.map((t) => [t.id, t]));
  return (
    <>
      {[...season.tournaments].reverse().map((t) => {
        const ranked = [...t.scores].sort((a, b) => b.total - a.total);
        const mine = me ? t.scores.find((s) => s.owner === me) : undefined;
        const myPlace = mine ? ranked.findIndex((s) => s.owner === me) + 1 : 0;
        const winner = t.scores.find((s) => s.owner === t.winners[0]);
        const best = winner ? [...winner.picks].sort((a, b) => b.earnings - a.earnings)[0] : undefined;
        return (
          <section className="fcard" key={t.tournamentId}>
            <div className="fhead">
              <span className="fname" style={{ fontStyle: 'normal', fontSize: 13 }}>{byId.get(t.tournamentId)?.name ?? `Event ${t.tournamentId}`}</span>
              {myPlace > 0 && <span className="tag">YOU: {ordinal(myPlace).toUpperCase()} · {money(mine!.total)}</span>}
            </div>
            <div className="grow" style={rowStyle(t.winners.includes(me ?? ''))}>
              <span style={{ fontSize: 18 }}>🏆</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{t.winners.join(' & ') || 'No winner'}</div>
                {best?.counted && <div className="small muted">Top golfer: {best.counted} ({money(best.earnings)})</div>}
              </div>
              <b>{money(t.topTotal)}</b>
            </div>
          </section>
        );
      })}
    </>
  );
}

function PayoutsTab({ season, league, me }: { season: SeasonResult; league: League; me: string | null }) {
  const weekly = Number(league.season?.weekly_prize ?? 5);
  const rows = season.standings
    .map((r) => {
      // A shared weekly win splits that week's prize.
      const won = season.tournaments.reduce((s, t) => s + (t.winners.includes(r.owner) ? weekly / t.winners.length : 0), 0);
      return { owner: r.owner, weekly: won };
    })
    .filter((r) => r.weekly > 0)
    .sort((a, b) => b.weekly - a.weekly);
  const entries = league.owners.length;
  const pot = entries * Number(league.season?.entry_fee ?? 30);
  return (
    <>
      <section className="fcard">
        <div className="fhead"><span className="fname" style={{ fontStyle: 'normal' }}>Weekly prizes so far</span><span className="tag">{money(weekly)} / EVENT</span></div>
        {rows.length ? rows.map((r) => (
          <div key={r.owner} className="grow" style={rowStyle(r.owner === me)}>
            <span style={{ flex: 1 }}>{r.owner}</span>
            <b>${r.weekly % 1 ? r.weekly.toFixed(2) : r.weekly}</b>
          </div>
        )) : <div className="grow muted small">No weekly winners yet.</div>}
      </section>
      <section className="fcard">
        <div className="fhead"><span className="fname" style={{ fontStyle: 'normal' }}>Season prizes</span><span className="tag">POT {money(pot)}</span></div>
        <div className="grow small" style={{ display: 'block' }}>
          {entries} entries. The split for 1st, 2nd and the flight winners hasn't been set yet. Current leaders:
          <div style={{ marginTop: 6 }}>
            <b>Season:</b> {season.standings[0]?.owner ?? '—'}
            {FLIGHTS.map((f) => (
              <span key={f}> · <b>{FLIGHT_LABELS[f]}:</b> {season.flightLeaders[f].total > 0 ? season.flightLeaders[f].owners.join(' & ') : '—'}</span>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
