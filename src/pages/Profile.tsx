import { useState } from 'react';
import type { League } from '../lib/api';
import { initials } from '../lib/home';
import { money } from '../lib/league';
import Commissioner from './Commissioner';
import type { Session } from './Login';

/** Profile: who's signed in, league info, and the commissioner tools. */
export default function Profile({ league, session, onChange, onSignOut }: {
  league: League;
  session: Session;
  onChange: () => Promise<void> | void;
  onSignOut: () => void;
}) {
  const [tools, setTools] = useState(session.kind === 'admin');
  const name = session.kind === 'owner' ? session.name : 'Commissioner';

  return (
    <>
      <div className="card">
        <div className="profile-head">
          <span className="avatar">{initials(name)}</span>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0 }}>{name}</h2>
            <span className="small muted">{league.season?.name ?? 'PGA Fantasy 2027'}</span>
          </div>
          <button className="btn ghost" onClick={onSignOut}>Log out</button>
        </div>
        {league.season && (
          <p className="small muted" style={{ marginBottom: 0 }}>
            Entry fee {money(Number(league.season.entry_fee))} · Weekly prize {money(Number(league.season.weekly_prize))}.
            Forgot your PIN? Ask the commissioner to reset it.
          </p>
        )}
      </div>

      <div className="card" style={{ borderColor: '#b7791f', borderWidth: 2 }}>
        <div className="spread">
          <h2 style={{ margin: 0 }}>Commissioner tools</h2>
          {!tools && <button className="btn ghost" onClick={() => setTools(true)}>Open</button>}
        </div>
        {!tools && <p className="small muted" style={{ marginBottom: 0 }}>Swaps for owners, the weekly field, results and season setup. Needs the commissioner PIN.</p>}
      </div>
      {tools && <Commissioner league={league} onChange={onChange} initialPin={session.kind === 'admin' ? session.pin : undefined} />}
    </>
  );
}
