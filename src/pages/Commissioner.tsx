import { useState } from 'react';
import { adminCheck, adminSetSwap, type League } from '../lib/api';
import { FLIGHTS, FLIGHT_LABELS, type Flight, type SwapKind } from '../lib/scoring';
import SeasonSetup from './SeasonSetup';
import Results from './Results';
import Field from './Field';

export default function Commissioner({ league, onChange, initialPin }: { league: League; onChange: () => Promise<void> | void; initialPin?: string }) {
  // The commissioner PIN is kept in memory only, never saved in the browser.
  const [pin, setPin] = useState(initialPin ?? '');
  const [ok, setOk] = useState(Boolean(initialPin));
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [owner, setOwner] = useState('');
  const [tid, setTid] = useState<number | ''>('');
  const [flight, setFlight] = useState<Flight>('SUPER');
  const [kind, setKind] = useState<SwapKind | 'none'>('week');
  const [view, setView] = useState<'swaps' | 'field' | 'results' | 'setup'>('swaps');

  const login = async () => {
    setError('');
    try {
      if (await adminCheck(pin)) setOk(true);
      else setError('Wrong commissioner PIN.');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!ok) {
    return (
      <div className="card">
        <h2>Commissioner</h2>
        <form className="row" onSubmit={(e) => { e.preventDefault(); void login(); }}>
          <input type="password" inputMode="numeric" placeholder="Commissioner PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
          <button className="btn" disabled={!pin}>Unlock</button>
        </form>
        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  const save = async () => {
    setError('');
    setMsg('');
    try {
      await adminSetSwap(pin, owner, Number(tid), flight, kind === 'none' ? null : kind);
      setMsg(`Saved ${owner}'s ${FLIGHT_LABELS[flight]} flight for ${league.tournaments.find((t) => t.id === tid)?.name}.`);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
    <div className="row" style={{ marginBottom: 16 }}>
      <button className={`btn ${view === 'swaps' ? '' : 'ghost'}`} onClick={() => setView('swaps')}>Swaps</button>
      <button className={`btn ${view === 'field' ? '' : 'ghost'}`} onClick={() => setView('field')}>Weekly field</button>
      <button className={`btn ${view === 'results' ? '' : 'ghost'}`} onClick={() => setView('results')}>Results</button>
      <button className={`btn ${view === 'setup' ? '' : 'ghost'}`} onClick={() => setView('setup')}>Season setup</button>
    </div>
    {view === 'setup' ? <SeasonSetup pin={pin} league={league} onChange={onChange} /> : view === 'field' ? <Field pin={pin} league={league} onChange={onChange} /> : view === 'results' ? <Results pin={pin} league={league} onChange={onChange} /> : (
    <div className="card">
      <h2>Swap for an owner</h2>
      <p className="muted small">For when someone texts or emails you a swap. This works even after the lock, so you can fix mistakes.</p>
      <div className="row">
        <select value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Owner…</option>
          {league.owners.map((o) => <option key={o.id}>{o.name}</option>)}
        </select>
        <select className="wide" value={tid} onChange={(e) => setTid(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Tournament…</option>
          {league.tournaments.map((t) => <option key={t.id} value={t.id}>{t.id}. {t.name}</option>)}
        </select>
        <select value={flight} onChange={(e) => setFlight(e.target.value as Flight)}>
          {FLIGHTS.map((f) => <option key={f} value={f}>{FLIGHT_LABELS[f]} flight</option>)}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as SwapKind | 'none')}>
          <option value="week">Swap this week only</option>
          <option value="permanent">Swap permanently</option>
          <option value="none">Remove swap</option>
        </select>
        <button className="btn" disabled={!owner || tid === ''} onClick={save}>Save</button>
      </div>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="error">{error}</div>}
    </div>
    )}
    </>
  );
}
