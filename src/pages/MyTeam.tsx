import { useCallback, useEffect, useState } from 'react';
import { getMySwaps, setMySwap, type League, type MySwap } from '../lib/api';
import { formatLock, openTournaments, planFor } from '../lib/league';
import { FLIGHT_LABELS, type Flight, type SwapKind } from '../lib/scoring';

/** Roster & Picks: the signed-in owner's lineup with swaps for open tournaments. */
export default function MyTeam({ league, name, pin }: { league: League; name: string; pin: string }) {
  const [mySwaps, setMySwaps] = useState<MySwap[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const open = openTournaments(league.tournaments);
  const [tid, setTid] = useState<number | null>(open[0]?.id ?? null);

  const load = useCallback(async (n: string, p: string) => {
    setMySwaps(await getMySwaps(n, p));
  }, []);
  useEffect(() => { load(name, pin).catch((e) => setError((e as Error).message)); }, [name, pin, load]);

  const roster = league.rosters.find((r) => r.owner === name);
  if (!roster) return <div className="card muted">Your roster hasn't been entered yet.</div>;

  const t = league.tournaments.find((x) => x.id === tid) ?? open[0];
  const swaps = mySwaps.map((s) => ({ ...s, owner: name }));

  const choose = async (flight: Flight, kind: SwapKind | null) => {
    if (!t) return;
    setError('');
    setBusy(true);
    try {
      await setMySwap(name, pin, t.id, flight, kind);
      await load(name, pin);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="section-head"><h2>ROSTER &amp; PICKS</h2></div>
      {!t ? (
        <div className="card muted">No upcoming tournaments are open for swaps right now.</div>
      ) : (
        <div className="card">
          <div className="spread">
            <div>
              {open.length > 1 ? (
                <select value={t.id} onChange={(e) => setTid(Number(e.target.value))} aria-label="Tournament">
                  {open.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              ) : (
                <h2 style={{ margin: 0 }}>{t.name}</h2>
              )}
              <div className="muted small">Swaps lock at first tee time: {formatLock(t.lock_at)}</div>
            </div>
            {t.field_url && <a href={t.field_url} target="_blank" rel="noreferrer">See the field ↗</a>}
          </div>

          {planFor(roster, swaps, t.id).map((p) => (
            <div className="flight" key={p.flight}>
              <div className="spread">
                <span className="name">{FLIGHT_LABELS[p.flight]} flight</span>
                {p.choice === 'week' && <span className="pill warn">Swapped this week</span>}
                {p.choice === 'permanent' && <span className="pill warn">Swapped permanently</span>}
              </div>
              <div>▶ <b>{p.playing}</b> <span className="muted small">counts</span></div>
              <div className="muted">⤷ {p.bench} <span className="small">— counts only if {p.playing.split(' ').slice(-1)} isn't in the field</span></div>
              <div className="seg" role="group" aria-label={`${FLIGHT_LABELS[p.flight]} flight swap`}>
                <button className={p.choice === null ? 'on' : ''} disabled={busy} onClick={() => choose(p.flight, null)}>
                  Start {p.before.starter.split(' ').slice(-1)}
                </button>
                <button className={p.choice === 'week' ? 'on' : ''} disabled={busy} onClick={() => choose(p.flight, 'week')}>
                  Swap this week
                </button>
                <button className={p.choice === 'permanent' ? 'on' : ''} disabled={busy} onClick={() => choose(p.flight, 'permanent')}>
                  Swap permanently
                </button>
              </div>
            </div>
          ))}
          {error && <div className="error">{error}</div>}
          <p className="muted small">
            You don't need to do anything if your starter isn't playing: your alternate counts automatically.
            Other owners see your swaps once the tournament locks.
          </p>
        </div>
      )}
    </>
  );
}
