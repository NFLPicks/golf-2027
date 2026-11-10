import { useCallback, useEffect, useState } from 'react';
import { getMySwaps, ownerLogin, setMySwap, type League, type MySwap } from '../lib/api';
import { formatLock, openTournaments, planFor } from '../lib/league';
import { FLIGHT_LABELS, type Flight, type SwapKind } from '../lib/scoring';
import { store } from '../storage';

export default function MyTeam({ league }: { league: League }) {
  const [name, setName] = useState(() => store.get('owner') ?? '');
  const [pin, setPin] = useState(() => store.get('pin') ?? '');
  const [loggedIn, setLoggedIn] = useState(false);
  const [mySwaps, setMySwaps] = useState<MySwap[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const open = openTournaments(league.tournaments);
  const [tid, setTid] = useState<number | null>(open[0]?.id ?? null);

  const load = useCallback(async (n: string, p: string) => {
    setMySwaps(await getMySwaps(n, p));
  }, []);

  const login = async (n = name, p = pin) => {
    setError('');
    setBusy(true);
    try {
      const o = await ownerLogin(n, p);
      store.set('owner', o.name);
      store.set('pin', p);
      setName(o.name);
      await load(o.name, p);
      setLoggedIn(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Log back in automatically on return visits.
  useEffect(() => {
    if (name && pin) void login(name, pin);
  }, []);

  const logout = () => {
    store.set('pin', null);
    setPin('');
    setLoggedIn(false);
  };

  if (!loggedIn) {
    return (
      <div className="card">
        <h2>Sign in</h2>
        <form className="row" onSubmit={(e) => { e.preventDefault(); void login(); }}>
          <select value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name">
            <option value="">Your name…</option>
            {league.owners.map((o) => <option key={o.id}>{o.name}</option>)}
          </select>
          <input type="password" inputMode="numeric" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} aria-label="PIN" />
          <button className="btn" disabled={!name || !pin || busy}>Sign in</button>
        </form>
        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  const roster = league.rosters.find((r) => r.owner === name);
  if (!roster) return <div className="card">Your roster hasn't been entered yet. <button className="btn ghost" onClick={logout}>Sign out</button></div>;

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
      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>{name}</h2>
          <button className="btn ghost" onClick={logout}>Sign out</button>
        </div>
      </div>

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
