import { useMemo, useState } from 'react';
import { adminSetAlias, adminSetResults, type League } from '../lib/api';
import { money } from '../lib/league';
import { nameCheck, parseLeaderboard } from '../lib/resultsParse';
import { buildField, FLIGHTS, scoreTournament } from '../lib/scoring';

type Props = { pin: string; league: League; onChange: () => Promise<void> | void };

export default function Results({ pin, league, onChange }: Props) {
  const ts = [...league.tournaments].sort((a, b) => a.id - b.id);
  const firstOpen = ts.find((t) => t.status !== 'final' && new Date(t.lock_at) <= new Date()) ?? ts[0];
  const [tid, setTid] = useState<number | undefined>(firstOpen?.id);
  const [text, setText] = useState('');
  const [final, setFinal] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const t = ts.find((x) => x.id === tid);
  const existing = tid !== undefined ? league.results[tid] ?? [] : [];

  const parsed = useMemo(() => parseLeaderboard(text), [text]);
  const rosterGolfers = useMemo(() => league.rosters.flatMap((r) => FLIGHTS.flatMap((f) => [r.slots[f].starter, r.slots[f].alternate])), [league]);
  const missing = useMemo(() => nameCheck(rosterGolfers, parsed.rows, league.aliases), [rosterGolfers, parsed, league.aliases]);
  const preview = useMemo(
    () => (tid !== undefined && parsed.rows.length ? scoreTournament(tid, league.rosters, league.swaps, buildField(parsed.rows, league.aliases)) : null),
    [tid, parsed, league],
  );

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setMsg(''); setError('');
    try { await fn(); await onChange(); setMsg(done); } catch (e) { setError((e as Error).message); }
  };

  if (!ts.length) return <div className="card muted">Add tournaments under Season setup first.</div>;

  return (
    <>
      <div className="card">
        <h2>Enter results</h2>
        <select value={tid} onChange={(e) => { setTid(Number(e.target.value)); setText(''); setMsg(''); }}>
          {ts.map((x) => (
            <option key={x.id} value={x.id}>
              {x.id}. {x.name} {x.status === 'final' ? '✓' : league.results[x.id]?.length ? '(partial)' : ''}
            </option>
          ))}
        </select>
        {existing.length > 0 && <p className="muted small">{existing.length} results already saved for this tournament. Saving again replaces them.</p>}
        <p className="muted small">
          On ESPN's leaderboard for {t?.name ?? 'the tournament'}, select the whole table (from POS down to the last player), copy it, and paste it here.
          Two columns from Excel (name, earnings) work too. Missed cuts and withdrawals can stay in; they count as $0.
        </p>
        <textarea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'POS\tPLAYER\tSCORE\t…\tEARNINGS\n1\tScottie Scheffler\t-16\t…\t$10,000,000'}
          style={{ width: '100%', font: 'inherit', fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--text)' }}
        />
        {parsed.warnings.map((w) => <div key={w} className="error small">{w}</div>)}
        {parsed.rows.length > 0 && (
          <p className="small">
            Read <b>{parsed.rows.length}</b> golfers, <b>{parsed.rows.filter((r) => r.earnings !== null).length}</b> with prize money
            (top: {parsed.rows[0].golfer}, {parsed.rows[0].earnings !== null ? money(parsed.rows[0].earnings) : 'no money'}).
          </p>
        )}
      </div>

      {parsed.rows.length > 0 && (
        <div className="card">
          <h2>Check names</h2>
          {missing.filter((m) => m.maybe.length).length === 0 ? (
            <p className="ok">No likely misspellings. Every roster golfer either matches or isn't in this field.</p>
          ) : (
            <>
              <p className="muted small">These roster golfers weren't found, but a golfer with the same last name was. If it's the same person, tap to link them (remembered for the whole season).</p>
              {missing.filter((m) => m.maybe.length).map((m) => (
                <div key={m.golfer} className="row" style={{ marginBottom: 6 }}>
                  <b>{m.golfer}</b>
                  {m.maybe.map((alt) => (
                    <button key={alt} className="btn ghost" onClick={() => act(() => adminSetAlias(pin, alt, m.golfer), `Linked "${alt}" to ${m.golfer}.`)}>
                      Same as “{alt}”
                    </button>
                  ))}
                </div>
              ))}
            </>
          )}
          <details>
            <summary className="small muted">{missing.length} roster golfers not in this field (their alternates count instead)</summary>
            <p className="small muted">{missing.map((m) => m.golfer).join(', ')}</p>
          </details>
        </div>
      )}

      {preview && (
        <div className="card">
          <h2>Preview: this week</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th className="l">Owner</th><th>Earned</th></tr></thead>
              <tbody>
                {[...preview.scores].sort((a, b) => b.total - a.total).slice(0, 5).map((s) => (
                  <tr key={s.owner}><td className="l">{preview.winners.includes(s.owner) ? '🏆 ' : ''}{s.owner}</td><td>{money(s.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <label className="row small"><input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} /> Tournament is over (final)</label>
            <button
              className="btn"
              onClick={() =>
                act(async () => {
                  const r = await adminSetResults(pin, tid!, parsed.rows, final);
                  setText('');
                  return r;
                }, `Saved ${parsed.rows.length} results for ${t?.name}. Standings are updated.`)
              }
            >
              Save results
            </button>
          </div>
        </div>
      )}
      {msg && <div className="card ok">{msg}</div>}
      {error && <div className="card error">{error}</div>}
    </>
  );
}
