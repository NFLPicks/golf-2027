import { useCallback, useEffect, useState } from 'react';
import { getLeague, isConfigured, type League } from './lib/api';
import Standings from './pages/Standings';
import MyTeam from './pages/MyTeam';
import Commissioner from './pages/Commissioner';
import { store } from './storage';

type Tab = 'standings' | 'team' | 'admin';

export default function App() {
  const [tab, setTab] = useState<Tab>(() => (store.get('tab') as Tab) || 'standings');
  const [league, setLeague] = useState<League | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!isConfigured()) return;
    try {
      setLeague(await getLeague());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => store.set('tab', tab), [tab]);

  return (
    <>
      <header className="top">
        <h1>⛳ {league?.season?.name ?? 'Golf Fantasy'}</h1>
        <nav className="tabs">
          <button className={tab === 'standings' ? 'on' : ''} onClick={() => setTab('standings')}>Standings</button>
          <button className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>My team</button>
          <button className={tab === 'admin' ? 'on' : ''} onClick={() => setTab('admin')}>Commissioner</button>
        </nav>
      </header>
      <main>
        {!isConfigured() && (
          <div className="card">The app isn't connected to its database yet.</div>
        )}
        {error && <div className="card error">Couldn't load the league: {error}</div>}
        {isConfigured() && !league && !error && <div className="card muted">Loading…</div>}
        {league && tab === 'standings' && <Standings league={league} />}
        {league && tab === 'team' && <MyTeam league={league} />}
        {league && tab === 'admin' && <Commissioner league={league} onChange={reload} />}
      </main>
    </>
  );
}
