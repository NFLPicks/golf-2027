import { useEffect, useMemo, useState } from 'react';
import {
  adminGetOwners,
  adminReopenDraft,
  adminSetPicksDeadline,
  adminRemoveOwner,
  adminRemoveTournament,
  adminSetGolfers,
  adminSetRosterSlot,
  adminUpsertOwner,
  adminSetSchedule,
  type AdminOwner,
  type League,
} from '../lib/api';
import { EventLogo } from '../components/Images';
import { parseSchedule, SCHEDULE_TEMPLATE } from '../lib/scheduleParse';
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
      <TeamPicks {...props} />
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

/** Build your team: the picks deadline (rosters go public then) and who has submitted. */
function TeamPicks({ pin, league, onChange }: Props) {
  const [owners, setOwners] = useState<AdminOwner[]>([]);
  const toLocal = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  };
  const [deadline, setDeadline] = useState(toLocal(league.season?.picks_deadline));
  const { run, view } = useStatus();
  const load = async () => setOwners(await adminGetOwners(pin));
  useEffect(() => { void load(); }, []); // eslint-disable-line
  const submitted = owners.filter((o) => o.submittedAt).length;

  return (
    <div className="card">
      <h2>Build your team ({submitted} of {owners.length} submitted)</h2>
      <p className="muted small">
        Owners pick 2 golfers per flight on Roster &amp; Picks and submit once. Nobody sees anyone else's team until the deadline, then all rosters show.
        With no deadline set, a team shows as soon as it's submitted.
      </p>
      <div className="row">
        <label className="small" style={{ flex: '1 1 200px' }}>
          Picks deadline
          <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ display: 'block', width: '100%' }} />
        </label>
        <button className="btn" onClick={() => void run(async () => { await adminSetPicksDeadline(pin, deadline ? new Date(deadline).toISOString() : null); await onChange(); }, deadline ? 'Deadline saved.' : 'Deadline cleared.')}>
          Save
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        {owners.map((o) => (
          <div key={o.name} className="spread small" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
            <span><b>{o.name}</b></span>
            <span className="row" style={{ gap: 6 }}>
              {o.submittedAt
                ? <span className="ok">Submitted {new Date(o.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                : <span className="muted">{o.drafted ? `Picking (${o.drafted} of 6 flights started)` : league.rosters.some((r) => r.owner === o.name) ? 'Entered by you' : 'Not started'}</span>}
              {o.submittedAt && (
                <button className="btn ghost" style={{ padding: '2px 8px' }} onClick={() => void run(async () => { await adminReopenDraft(pin, o.name); await load(); }, `${o.name} can change their team again.`)}>
                  Reopen
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
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

function Schedule(props: Props) {
  return (
    <>
      <PasteSchedule {...props} />
      <ScheduleTable {...props} />
    </>
  );
}

/** Paste the whole season from a spreadsheet: preview, then save in one go (all or nothing). */
function PasteSchedule({ pin, league, onChange }: Props) {
  const [text, setText] = useState('');
  const { run, view } = useStatus();
  const firstId = Math.max(0, ...league.tournaments.map((t) => t.id)) + 1;
  const parsed = useMemo(() => parseSchedule(text, { firstId, year: 2027 }), [text, firstId]);
  const existing = new Set(league.tournaments.map((t) => t.id));

  return (
    <div className="card">
      <h2>Paste the season schedule</h2>
      <p className="muted small">
        Fill in a spreadsheet with these column names in the first row, then copy and paste the whole thing here. Only Event and
        Start are required. Add a "#" column to update events you already entered, and a "Lock" column (first tee time, Eastern) if
        it isn't 7:00 AM.
      </p>
      <div className="row">
        <span className="small"><b>Columns:</b> {SCHEDULE_TEMPLATE.split('\t').join(' · ')}</span>
        <button className="btn ghost" type="button" onClick={() => void navigator.clipboard?.writeText(SCHEDULE_TEMPLATE)}>Copy column names</button>
      </div>
      <textarea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={SCHEDULE_TEMPLATE + '\nWM Phoenix Open\t2/4/2027\t2/7/2027\tTPC Scottsdale\tScottsdale, AZ\t$9,800,000\tThomas Detry'}
        style={{ width: '100%', marginTop: 8, font: 'inherit', fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--text)' }}
      />
      {parsed.warnings.map((w) => <div key={w} className="error small">{w}</div>)}
      {parsed.rows.length > 0 && (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th className="l">Event</th><th className="l">Dates</th><th className="l">Swaps lock</th><th className="l">Course</th><th>Purse</th><th className="l">Champion</th></tr></thead>
              <tbody>
                {parsed.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}{existing.has(r.id) && <span className="muted small"> (update)</span>}</td>
                    <td className="l">{r.name}</td>
                    <td className="l">{r.start}{r.end ? ` to ${r.end}` : ''}</td>
                    <td className="l">{formatLock(r.lockAt)}</td>
                    <td className="l">{[r.course, r.location].filter(Boolean).join(', ')}</td>
                    <td>{r.purse ? money(r.purse) : ''}</td>
                    <td className="l">{r.champion ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="btn"
            style={{ marginTop: 8 }}
            onClick={() => void run(async () => { await adminSetSchedule(pin, parsed.rows); await onChange(); setText(''); }, `Saved ${parsed.rows.length} events.`)}
          >
            Save {parsed.rows.length} events
          </button>
        </>
      )}
      {view}
    </div>
  );
}

function ScheduleTable({ pin, league, onChange }: Props) {
  const empty = { id: '', name: '', start: '', end: '', lock: '', purse: '', course: '', location: '', champion: '', logo: '', fieldUrl: '' };
  const [f, setF] = useState(empty);
  const { run, view } = useStatus();
  const ts = [...league.tournaments].sort((a, b) => a.id - b.id);
  const nextId = String((ts.at(-1)?.id ?? 0) + 1);

  const edit = (id: number) => {
    const t = ts.find((x) => x.id === id)!;
    setF({
      id: String(t.id), name: t.name, start: t.start_date, end: t.end_date ?? '', lock: toLocalInput(t.lock_at),
      purse: t.purse ? String(t.purse) : '', course: t.course ?? '', location: t.location ?? '',
      champion: t.defending_champion ?? '', logo: t.logo ?? '', fieldUrl: t.field_url ?? '',
    });
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
            <thead><tr><th>#</th><th /><th className="l">Tournament</th><th className="l">Swaps lock</th><th className="l">Course</th><th>Purse</th><th /></tr></thead>
            <tbody>
              {ts.map((t) => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td>
                    <EventLogo t={t} size={28} />
                  </td>
                  <td className="l">{t.name}</td>
                  <td className="l">{formatLock(t.lock_at)}</td>
                  <td className="l">{t.course ?? ''}</td>
                  <td>{t.purse ? money(Number(t.purse)) : ''}</td>
                  <td><button className="btn ghost" onClick={() => edit(t.id)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        Add or fix one event at a time here. Two tournaments in the same week get separate numbers. "Swaps lock" is the first tee
        time on Thursday, in your time zone. Logos come from the images folder by event name; fill in "Logo file" only if the file
        is named differently.
      </p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await adminSetSchedule(pin, [{
              id: Number(f.id || nextId), name: f.name.trim(), start: f.start, end: f.end || null,
              lockAt: new Date(f.lock).toISOString(), purse: f.purse ? Number(f.purse.replace(/[$,]/g, '')) : null,
              course: f.course.trim() || null, location: f.location.trim() || null, champion: f.champion.trim() || null,
              logo: f.logo.trim() || null, fieldUrl: f.fieldUrl.trim() || null,
            }]);
            await onChange();
            setF(empty);
          }, `Saved ${f.name}.`);
        }}
      >
        <input style={{ width: 70 }} placeholder={`# ${nextId}`} inputMode="numeric" value={f.id} onChange={set('id')} aria-label="Number" />
        <input placeholder="Tournament name" value={f.name} onChange={set('name')} />
        <label className="small muted">Starts <input type="date" value={f.start} onChange={set('start')} /></label>
        <label className="small muted">Ends <input type="date" value={f.end} onChange={set('end')} /></label>
        <label className="small muted">Swaps lock <input type="datetime-local" value={f.lock} onChange={set('lock')} /></label>
        <input placeholder="Purse ($)" inputMode="numeric" value={f.purse} onChange={set('purse')} />
        <input placeholder="Course" value={f.course} onChange={set('course')} />
        <input placeholder="Location" value={f.location} onChange={set('location')} />
        <input placeholder="Last year's champion" value={f.champion} onChange={set('champion')} />
        <input placeholder="Logo file (optional)" value={f.logo} onChange={set('logo')} />
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
