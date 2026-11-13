import { useState } from 'react';
import { adminCheck, ownerLogin, type League } from '../lib/api';
import { ArrowIcon, FlagIcon } from '../components/Icons';
import { store } from '../storage';

export type Session = { kind: 'owner'; name: string; pin: string } | { kind: 'admin'; pin: string };

export default function Login({ league, onSignIn }: { league: League; onSignIn: (s: Session) => void }) {
  const [mode, setMode] = useState<'owner' | 'admin'>('owner');
  const [name, setName] = useState(() => store.get('owner') ?? '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      if (mode === 'owner') {
        const o = await ownerLogin(name, pin);
        onSignIn({ kind: 'owner', name: o.name, pin });
      } else if (await adminCheck(pin)) {
        onSignIn({ kind: 'admin', pin });
      } else {
        setError('Wrong commissioner PIN.');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="tile" role="img" aria-label="PGA Fantasy 2027">
        <FlagIcon size={56} />
        <span className="display" style={{ fontSize: 22, letterSpacing: 1, lineHeight: 1 }}>PGA FANTASY</span>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 2, opacity: 0.9 }}>2027</span>
      </div>
      <h1>HIT IT LONG!</h1>
      <div className="toggle" role="group" aria-label="Sign in as">
        <button type="button" aria-pressed={mode === 'owner'} onClick={() => { setMode('owner'); setError(''); }}>Owner</button>
        <button type="button" aria-pressed={mode === 'admin'} onClick={() => { setMode('admin'); setError(''); }}>Commissioner</button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {mode === 'owner' && (
          <label className="field-label">
            YOUR NAME
            <select value={name} onChange={(e) => setName(e.target.value)}>
              <option value="">Select your name</option>
              {league.owners.map((o) => <option key={o.id}>{o.name}</option>)}
            </select>
          </label>
        )}
        <label className="field-label">
          {mode === 'owner' ? 'YOUR PIN' : 'COMMISSIONER PIN'}
          <input
            className="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </label>
        <button className="bigbtn" disabled={busy || !pin || (mode === 'owner' && !name)}>
          Enter <ArrowIcon />
        </button>
        {error && <div className="error" style={{ textAlign: 'center' }}>{error}</div>}
      </form>
      <span className="small muted" style={{ textAlign: 'center' }}>Forgot your PIN? Ask the commissioner to reset it.</span>
    </div>
  );
}
