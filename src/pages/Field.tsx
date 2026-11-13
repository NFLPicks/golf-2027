import { useEffect, useMemo, useState } from 'react';
import { adminSetAlias, adminSetField, getField, type League } from '../lib/api';
import { parseField } from '../lib/fieldParse';
import { formatLock, isLocked } from '../lib/league';
import { nameCheck } from '../lib/resultsParse';
import { FLIGHTS } from '../lib/scoring';

type Props = { pin: string; league: League; onChange: () => Promise<void> | void };

/** Commissioner: post who is playing this week, so owners see In Field / Not In Field badges. */
export default function Field({ pin, league, onChange }: Props) {
  const ts = [...league.tournaments].sort((a, b) => a.id - b.id);
  const next = ts.find((t) => !isLocked(t)) ?? ts.at(-1);
  const [tid, setTid] = useState<number | undefined>(next?.id);
  const [posted, setPosted] = useState<string[] | null>(null);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const t = ts.find((x) => x.id === tid);

  const load = async (id: number) => {
    setPosted(null);
    try { setPosted(await getField(id)); } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { if (tid !== undefined) void load(tid); }, [tid]);

  const parsed = useMemo(() => parseField(text), [text]);
  const rosterGolfers = useMemo(
    () => [...new Set(league.rosters.flatMap((r) => FLIGHTS.flatMap((f) => [r.slots[f].starter, r.slots[f].alternate])))],
    [league],
  );
  const missing = useMemo(
    () => nameCheck(rosterGolfers, parsed.names.map((g) => ({ golfer: g, earnings: 0 })), league.aliases),
    [rosterGolfers, parsed, league.aliases],
  );

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setMsg(''); setError('');
    try { await fn(); setMsg(done); } catch (e) { setError((e as Error).message); }
  };

  if (!ts.length) return <div className="card muted">Add tournaments under Season setup first.</div>;

  return (
    <>
      <div className="card">
        <h2>Weekly field</h2>
        <select value={tid} onChange={(e) => { setTid(Number(e.target.value)); setText(''); setMsg(''); }}>
          {ts.map((x) => <option key={x.id} value={x.id}>{x.id}. {x.name}</option>)}
        </select>
        {t && <p className="muted small">Lineups lock {formatLock(t.lock_at)}.</p>}
        <p className="small">
          {posted === null ? 'Checking…' : posted.length ? <>Field posted: <b>{posted.length}</b> golfers. Pasting again replaces it.</> : 'No field posted yet. Owners see "Field not posted yet" until you add it.'}
        </p>
        <p className="muted small">
          The field posts itself from ESPN every morning Monday to Thursday (and Tue/Wed evenings), picking up withdrawals.
          To post it yourself, copy the field (or the Round 1 tee times) from ESPN or the PGA Tour and paste it here. One name per line works too.
        </p>
        <textarea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Scottie Scheffler\nRory McIlroy\n…'}
          style={{ width: '100%', font: 'inherit', fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--text)' }}
        />
        {parsed.skipped.length > 0 && <p className="muted small">Skipped {parsed.skipped.length} lines that didn't look like a name (e.g. "{parsed.skipped[0]}").</p>}
        {parsed.names.length > 0 && (
          <p className="small">
            Read <b>{parsed.names.length}</b> golfers. <b>{rosterGolfers.length - missing.length}</b> of the {rosterGolfers.length} golfers on league rosters are in this field.
          </p>
        )}
      </div>

      {parsed.names.length > 0 && (
        <div className="card">
          <h2>Check names</h2>
          {missing.filter((m) => m.maybe.length).length === 0 ? (
            <p className="ok">No likely misspellings.</p>
          ) : (
            <>
              <p className="muted small">These roster golfers weren't found, but someone with the same last name was. If it's the same person, link them (remembered all season).</p>
              {missing.filter((m) => m.maybe.length).map((m) => (
                <div key={m.golfer} className="row" style={{ marginBottom: 6 }}>
                  <b>{m.golfer}</b>
                  {m.maybe.map((alt) => (
                    <button key={alt} className="btn ghost" onClick={() => act(async () => { await adminSetAlias(pin, alt, m.golfer); await onChange(); }, `Linked "${alt}" to ${m.golfer}.`)}>
                      Same as “{alt}”
                    </button>
                  ))}
                </div>
              ))}
            </>
          )}
          <details>
            <summary className="small muted">{missing.length} roster golfers not in this field</summary>
            <p className="small muted">{missing.map((m) => m.golfer).join(', ')}</p>
          </details>
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn"
              onClick={() => act(async () => { await adminSetField(pin, tid!, parsed.names); setText(''); await load(tid!); }, `Saved the field for ${t?.name}: ${parsed.names.length} golfers.`)}
            >
              Save field
            </button>
          </div>
        </div>
      )}

      {posted && posted.length > 0 && !parsed.names.length && (
        <div className="card">
          <details>
            <summary className="small">Show the posted field ({posted.length})</summary>
            <p className="small muted">{posted.join(', ')}</p>
          </details>
          <button
            className="btn ghost"
            onClick={() => { if (confirm(`Clear the field for ${t?.name}?`)) void act(async () => { await adminSetField(pin, tid!, []); await load(tid!); }, 'Field cleared.'); }}
          >
            Clear field
          </button>
        </div>
      )}
      {msg && <div className="card ok">{msg}</div>}
      {error && <div className="card error">{error}</div>}
    </>
  );
}
