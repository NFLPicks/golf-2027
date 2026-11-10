import { useEffect, useMemo, useState } from 'react';
import {
  adminGetOwners,
  adminRemoveOwner,
  adminRemoveTournament,
  adminSetGolfers,
  adminSetRosterSlot,
  adminUpsertOwner,
  adminUpsertTournament,
  type AdminOwner,
  type League,
} from '../lib/api';
import { golferListText, parseGolferList } from '../lib/golferList';
import { formatLock, money } from '../lib/league';
import { FLIGHTS, FLIGHT_LABELS, type Flight } from '../lib/scoring';

type Props = { pin: string; league: League; onChange: () => Promise<void> | void };

function useStatus() {
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setMsg('');
    setError('');
    try {
      await fn();
      setMsg(done);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const view = (
    <>
      {msg && <div className="ok">{msg}</div>}
      {error && <div className="error">{error}</div>}
    </>
  );
  return { run, view };
}

export default function SeasonSetup(props: Props) {
  return (
    <>
      <Owners {...props} />
      <Golfers {...props} />
      <Rosters {...props} />
      <Schedule {...props} />
    </>
  );
}

function Owners({ pin, onChange }: Props) {
  const [owners, setOwners] = useState<AdminOwner[]>([]);
  const [name, setName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [email, setEmail] = useState('');
  const [paid, setPaid] = useState(false);
  const { run, view } = useStatus();
  const load = async () => setOwners(await adminGetOwners(pin));
  useEffect(() => { void load(); }, []); // eslint-disable-line

  const existing = owners.find((o) => o.name.toLowerCase() === name.trim().toLowerCase());
  const pick = (o: AdminOwner) => { setName(o.name); setEmail(o.email ?? ''); setPaid(o.paid); setNewPin(''); };

  return (
    <div className="card">
      <h2>Owners ({owners.length})</h2>
      <p className="muted small">Add each person in the league and give them a PIN to sign in with. Click a name to edit it or reset their PIN.</p>
      <div className="row">
        {owners.map((o) => (
          <button key={o.name} className="pill" style={{ border: 0, cursor: 'pointer' }} onClick={() => pick(o)}>
            {o.name} {o.paid ? '✓' : '· unpaid'}
          </button>
        ))}
      </div>
      <form
        className="row"
        style={{ marginTop: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await adminUpsertOwner(pin, name.trim(), newPin, email.trim() || null, paid);
            await load();
            await onChange();
            setName(''); setNewPin(''); setEmail(''); setPaid(false);
          }, existing ? `Updated ${name}.` : `Added ${name}.`);
        }}
      >
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder={existing ? 'New PIN (blank = keep)' : 'PIN'} inputMode="numeric" value={newPin} onChange={(e) => setNewPin(e.target.value)} />
        <input placeholder="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="row small"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Paid</label>
        <button className="btn" disabled={!name.trim() || (!existing && !newPin)}>{existing ? 'Save' : 'Add'}</button>
        {existing && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              if (!confirm(`Remove ${existing.name}, their roster and swaps?`)) return;
              void run(async () => { await adminRemoveOwner(pin, existing.name); await load(); await onChange(); setName(''); }, `Removed ${existing.name}.`);
            }}
          >
            Remove
          </button>
        )}
      </form>
      {view}
    </div>
  );
}

function Golfers({ pin, league, onChange }: Props) {
  const [text, setText] = useState(() => golferListText(league.golfers));
  const parsed = useMemo(() => parseGolferList(text), [text]);
  const { run, view } = useStatus();
  const counts = FLIGHTS.map((f) => `${FLIGHT_LABELS[f]} ${parsed.rows.filter((r) => r.flight === f).length}`).join(' · ');

  return (
    <div className="card">
      <h2>Golfer pool</h2>
      <p className="muted small">
        One golfer per line: name, then flight (Super, A, B, C, D or E). You can paste two columns straight from Excel.
        Saving replaces the whole list.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        style={{ width: '100%', font: 'inherit', padding: 10, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--text)' }}
        placeholder={'Scottie Scheffler, Super\nXander Schauffele, A'}
      />
      <div className="spread">
        <span className="muted small">{counts}</span>
        <button
          className="btn"
          disabled={!parsed.rows.length || parsed.errors.length > 0}
          onClick={() => run(async () => { await adminSetGolfers(pin, parsed.rows); await onChange(); }, `Saved ${parsed.rows.length} golfers.`)}
        >
          Save golfer pool
        </button>
      </div>
      {parsed.errors.length > 0 && <div className="error">{parsed.errors.slice(0, 5).map((e) => <div key={e}>{e}</div>)}</div>}
      {view}
    </div>
  );
}

function Rosters({ pin, league, onChange }: Props) {
  const [owner, setOwner] = useState('');
  const current = league.rosters.find((r) => r.owner === owner);
  const [draft, setDraft] = useState<Record<Flight, { starter: string; alternate: string }>>({} as never);
  const { run, view } = useStatus();

  useEffect(() => {
    setDraft(Object.fromEntries(FLIGHTS.map((f) => [f, current?.slots[f] ?? { starter: '', alternate: '' }])) as never);
  }, [owner, league]); // eslint-disable-line

  const byFlight = (f: Flight) => league.golfers.filter((g) => g.flight === f).map((g) => g.name);
  const missing = new Set(league.owners.map((o) => o.name).filter((n) => !league.rosters.some((r) => r.owner === n)));
  const complete = FLIGHTS.every((f) => draft[f]?.starter && draft[f]?.alternate && draft[f].starter !== draft[f].alternate);

  return (
    <div className="card">
      <h2>Rosters</h2>
      {!league.golfers.length ? (
        <p className="muted">Save the golfer pool first.</p>
      ) : (
        <>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Pick an owner…</option>
            {league.owners.map((o) => <option key={o.id} value={o.name}>{o.name}{missing.has(o.name) ? ' (no roster yet)' : ''}</option>)}
          </select>
          {owner && (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th className="l">Flight</th><th className="l">Starter</th><th className="l">Alternate</th></tr></thead>
                <tbody>
                  {FLIGHTS.map((f) => (
                    <tr key={f}>
                      <td className="l">{FLIGHT_LABELS[f]}</td>
                      {(['starter', 'alternate'] as const).map((k) => (
                        <td className="l" key={k}>
                          <select value={draft[f]?.[k] ?? ''} onChange={(e) => setDraft({ ...draft, [f]: { ...draft[f], [k]: e.target.value } })}>
                            <option value="">—</option>
                            {byFlight(f).map((n) => <option key={n}>{n}</option>)}
                          </select>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                className="btn"
                style={{ marginTop: 12 }}
                disabled={!complete}
                onClick={() =>
                  run(async () => {
                    for (const f of FLIGHTS) await adminSetRosterSlot(pin, owner, f, draft[f].starter, draft[f].alternate);
                    await onChange();
                  }, `Saved ${owner}'s roster.`)
                }
              >
                Save roster
              </button>
              {!complete && <div className="muted small">Pick two different golfers in every flight.</div>}
            </div>
          )}
        </>
      )}
      {view}
    </div>
  );
}

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function Schedule({ pin, league, onChange }: Props) {
  const empty = { id: '', name: '', start: '', lock: '', purse: '', fieldUrl: '' };
  const [f, setF] = useState(empty);
  const { run, view } = useStatus();
  const ts = [...league.tournaments].sort((a, b) => a.id - b.id);
  const nextId = String((ts.at(-1)?.id ?? 0) + 1);

  const edit = (id: number) => {
    const t = ts.find((x) => x.id === id)!;
    setF({ id: String(t.id), name: t.name, start: t.start_date, lock: toLocalInput(t.lock_at), purse: t.purse ? String(t.purse) : '', fieldUrl: t.field_url ?? '' });
  };
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    // Default the lock to 7:00 AM on the first day when a start date is picked.
    setF((p) => ({ ...p, [k]: v, ...(k === 'start' && v && !p.lock ? { lock: `${v}T07:00` } : {}) }));
  };

  return (
    <div className="card">
      <h2>Schedule</h2>
      {ts.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th className="l">Tournament</th><th className="l">Swaps lock</th><th>Purse</th><th /></tr></thead>
            <tbody>
              {ts.map((t) => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td className="l">{t.name}</td>
                  <td className="l">{formatLock(t.lock_at)}</td>
                  <td>{t.purse ? money(Number(t.purse)) : ''}</td>
                  <td><button className="btn ghost" onClick={() => edit(t.id)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        Two tournaments in the same week get separate numbers. "Swaps lock" is the first tee time on Thursday, in your time zone.
      </p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await adminUpsertTournament(pin, {
              id: Number(f.id || nextId), name: f.name.trim(), start: f.start, lockAt: new Date(f.lock).toISOString(),
              purse: f.purse ? Number(f.purse.replace(/[$,]/g, '')) : null, fieldUrl: f.fieldUrl.trim() || null,
            });
            await onChange();
            setF(empty);
          }, `Saved ${f.name}.`);
        }}
      >
        <input style={{ width: 70 }} placeholder={`# ${nextId}`} inputMode="numeric" value={f.id} onChange={set('id')} aria-label="Number" />
        <input placeholder="Tournament name" value={f.name} onChange={set('name')} />
        <label className="small muted">Starts <input type="date" value={f.start} onChange={set('start')} /></label>
        <label className="small muted">Swaps lock <input type="datetime-local" value={f.lock} onChange={set('lock')} /></label>
        <input placeholder="Purse ($)" inputMode="numeric" value={f.purse} onChange={set('purse')} />
        <input placeholder="Field link (optional)" value={f.fieldUrl} onChange={set('fieldUrl')} />
        <button className="btn" disabled={!f.name.trim() || !f.start || !f.lock}>Save tournament</button>
        {f.id && ts.some((t) => String(t.id) === f.id) && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              if (!confirm(`Remove ${f.name}?`)) return;
              void run(async () => { await adminRemoveTournament(pin, Number(f.id)); await onChange(); setF(empty); }, 'Removed.');
            }}
          >
            Remove
          </button>
        )}
      </form>
      {view}
    </div>
  );
}
