import { useCallback, useEffect, useMemo, useState } from 'react';
import { getLeague, isConfigured, ownerLogin, type League } from './lib/api';
import Standings from './pages/Standings';
import RosterPicks from './pages/RosterPicks';
import Home from './pages/Home';
import Calendar from './pages/Calendar';
import Profile from './pages/Profile';
import Login, { type Session } from './pages/Login';
import { CalendarIcon, ChartIcon, HomeIcon, Silhouette, TeamIcon } from './components/Icons';
import { initials } from './lib/home';
import { money } from './lib/league';
import { scoreSeason } from './lib/scoring';
import { store } from './storage';

export type Tab = 'home' | 'picks' | 'standings' | 'calendar' | 'profile';
const TABS: Tab[] = ['home', 'picks', 'standings', 'calendar', 'profile'];

export default function App() {
  const [tab, setTab] = useState<Tab>(() => {
    const t = store.get('tab') as Tab;
    return TABS.includes(t) ? t : 'home';
  });
  const [league, setLeague] = useState<League | null>(null);
  const [error, setError] = useState('');
  // Owners stay signed in on this device; the commissioner PIN is kept in memory only.
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

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

  // Sign back in automatically on return visits.
  useEffect(() => {
    const name = store.get('owner');
    const pin = store.get('pin');
    if (!name || !pin) { setChecking(false); return; }
    ownerLogin(name, pin)
      .then((o) => setSession({ kind: 'owner', name: o.name, pin }))
      .catch(() => store.set('pin', null))
      .finally(() => setChecking(false));
  }, []);

  const signIn = (s: Session) => {
    if (s.kind === 'owner') { store.set('owner', s.name); store.set('pin', s.pin); }
    setSession(s);
    setTab(s.kind === 'admin' ? 'profile' : 'home');
  };
  const signOut = () => { store.set('pin', null); setSession(null); };

  if (!isConfigured()) return <main><div className="card">The app isn't connected to its database yet.</div></main>;
  if (error && !league) return <main><div className="card error">Couldn't load the league: {error}</div></main>;
  if (!league || checking) return <main><div className="card muted">Loading…</div></main>;
  if (!session) return <Login league={league} onSignIn={signIn} />;

  const nav: { id: Tab; label: string; icon: JSX.Element }[] = [
    { id: 'home', label: 'HOME', icon: <HomeIcon /> },
    { id: 'picks', label: 'ROSTER & PICKS', icon: <TeamIcon /> },
    { id: 'standings', label: 'STANDINGS', icon: <ChartIcon /> },
    { id: 'calendar', label: 'CALENDAR', icon: <CalendarIcon /> },
    {
      id: 'profile',
      label: 'PROFILE',
      icon: (
        <span className="avatar" style={{ alignItems: session.kind === 'owner' ? 'center' : 'flex-end', fontSize: 10, background: '#1f4d31' }}>
          {session.kind === 'owner' ? initials(session.name) : <Silhouette size={22} />}
        </span>
      ),
    },
  ];

  return (
    <div className="shell">
      <div className="appbar">
        <header className="appbar-inner">
          <div>
            <span className="t1">PGA FANTASY</span>
            <span className="t2">{league.season?.name ?? '2027 Fantasy'}</span>
          </div>
          <button onClick={signOut}>LOG OUT</button>
        </header>
        <StatLine league={league} session={session} />
      </div>
      <main>
        {error && <div className="card error">Couldn't refresh: {error}</div>}
        {tab === 'home' && <Home league={league} session={session} onEdit={() => setTab('picks')} />}
        {tab === 'picks' && (session.kind === 'owner'
          ? <RosterPicks league={league} name={session.name} pin={session.pin} />
          : <div className="card muted">You're signed in as the commissioner. Sign in as an owner to see and change a lineup.</div>)}
        {tab === 'standings' && <Standings league={league} />}
        {tab === 'calendar' && <Calendar league={league} />}
        {tab === 'profile' && <Profile league={league} session={session} onChange={reload} onSignOut={signOut} />}
      </main>
      <nav className="bottomnav" aria-label="Main">
        {nav.map((n) => (
          <button key={n.id} aria-current={tab === n.id ? 'page' : undefined} onClick={() => setTab(n.id)}>
            {n.icon}
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}


/** "#3 of 14 · Season Earnings $8,489,000 · 1 Weekly Win" under the header. */
function StatLine({ league, session }: { league: League; session: Session }) {
  const season = useMemo(
    () => scoreSeason({ rosters: league.rosters, swaps: league.swaps, results: league.results, aliases: league.aliases }),
    [league],
  );
  if (session.kind !== 'owner') return <div className="statline"><span style={{ fontWeight: 600 }}>Commissioner</span></div>;
  const row = season.standings.find((r) => r.owner === session.name);
  if (!row) return <div className="statline"><span style={{ fontWeight: 600 }}>{session.name}</span></div>;
  return (
    <div className="statline">
      <span style={{ fontWeight: 600 }}>#{row.rank} of {season.standings.length}</span>
      <span>Season Earnings: <b>{money(row.total)}</b></span>
      <span>{row.weeklyWins} Weekly Win{row.weeklyWins === 1 ? '' : 's'}</span>
    </div>
  );
}
