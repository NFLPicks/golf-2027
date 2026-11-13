import { useMemo, useState } from 'react';
import { adminSetAlias, adminSetResults, type League } from '../lib/api';
import { money } from '../lib/league';
import { espnEventId, espnLeaderboardUrl, parseEspnLeaderboard, sameEvent, type EspnResults } from '../lib/espnParse';
import { nameCheck, parseLeaderboard, type ParsedResults } from '../lib/resultsParse';
import { store } from '../storage';
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

  // ESPN link/ID is remembered per tournament on this device.
  const [espnInput, setEspnInput] = useState(() => (firstOpen ? store.get(`espn:${firstOpen.id}`) ?? '' : ''));
  const [pulling, setPulling] = useState(false);
  const [espn, setEspn] = useState<EspnResults | null>(null);

  // Rows come from the ESPN pull, or from the box (ESPN's JSON or a copied table).
  const fromBox = useMemo((): ParsedResults | EspnResults => {
    if (!text.trim().startsWith('{')) return parseLeaderboard(text);
    try { return parseEspnLeaderboard(JSON.parse(text)); } catch (e) { return { rows: [], warnings: [(e as Error).message || "Couldn't read that JSON."] }; }
  }, [text]);
  const parsed = espn ?? fromBox;
  const espnInfo = 'paid' in parsed ? (parsed as EspnResults) : null;
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

  const choose = (id: number) => {
    setTid(id); setText(''); setMsg(''); setError(''); setEspn(null);
    setEspnInput(store.get(`espn:${id}`) ?? '');
  };

  const pull = async () => {
    const id = espnEventId(espnInput);
    setMsg(''); setError(''); setEspn(null);
    if (!id) { setError('Paste the ESPN leaderboard link for this event, or just its number (e.g. 401811937).'); return; }
    store.set(`espn:${tid}`, espnInput.trim());
    setPulling(true);
    try {
      const res = await fetch(espnLeaderboardUrl(id));
      if (!res.ok) throw new Error(`ESPN answered ${res.status}.`);
      setEspn(parseEspnLeaderboard(await res.json()));
      setText('');
    } catch (e) {
      const m = (e as Error).message;
      setError(`Couldn't pull from ESPN (${m.includes('ESPN') ? m : 'blocked or offline'}). Backup: open the ESPN data link below, copy everything, and paste it in the box.`);
    } finally {
      setPulling(false);
    }
  };
  const espnId = espnEventId(espnInput);

  if (!ts.length) return <div className="card muted">Add tournaments under Season setup first.</div>;

  return (
    <>
      <div className="card">
        <h2>Enter results</h2>
        <select value={tid} onChange={(e) => choose(Number(e.target.value))}>
          {ts.map((x) => (
            <option key={x.id} value={x.id}>
              {x.id}. {x.name} {x.status === 'final' ? '✓' : league.results[x.id]?.length ? '(partial)' : ''}
            </option>
          ))}
        </select>
        {existing.length > 0 && <p className="muted small">{existing.length} results already saved for this tournament. Saving again replaces them.</p>}
        <h3 style={{ margin: '12px 0 4px', fontSize: 15 }}>Pull from ESPN</h3>
        <p className="muted small" style={{ marginTop: 0 }}>Paste the ESPN leaderboard link for {t?.name ?? 'this event'} (or its event number) once. After that it's one tap.</p>
        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <input
            value={espnInput}
            onChange={(e) => setEspnInput(e.target.value)}
            placeholder="espn.com/golf/leaderboard/_/tournamentId/…"
            aria-label="ESPN leaderboard link or event number"
            style={{ flex: 1, minWidth: 0 }}
          />
          <button className="btn" disabled={pulling || !espnInput.trim()} onClick={() => void pull()}>{pulling ? 'Pulling…' : 'Pull'}</button>
        </div>
        {espnId && (
          <p className="muted small" style={{ marginBottom: 0 }}>
            Backup if Pull fails: <a href={espnLeaderboardUrl(espnId)} target="_blank" rel="noreferrer">open ESPN's data</a>, select all, copy, and paste it below.
          </p>
        )}

        <h3 style={{ margin: '14px 0 4px', fontSize: 15 }}>Or paste</h3>
        <p className="muted small" style={{ marginTop: 0 }}>
          On ESPN's leaderboard for {t?.name ?? 'the tournament'}, select the whole table (from POS down to the last player), copy it, and paste it here.
          Two columns from Excel (name, earnings) work too. Missed cuts and withdrawals can stay in; they count as $0.
        </p>
        <textarea
          rows={8}
          value={text}
          onChange={(e) => { setText(e.target.value); setEspn(null); }}
          placeholder={'POS\tPLAYER\tSCORE\t…\tEARNINGS\n1\tScottie Scheffler\t-16\t…\t$10,000,000'}
          style={{ width: '100%', font: 'inherit', fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--text)' }}
        />
        {parsed.warnings.map((w) => <div key={w} className="error small">{w}</div>)}
        {espnInfo && (
          <div className="small" style={{ marginTop: 8, padding: 8, borderRadius: 8, background: 'var(--brand-soft)' }}>
            <b>ESPN: {espnInfo.name}</b> · {espnInfo.final ? 'Final' : 'Not final yet'}
            <br />
            Prize money read: <b>{money(espnInfo.paid)}</b>
            {espnInfo.purse ? <> of a {money(espnInfo.purse)} purse ({Math.round((espnInfo.paid / espnInfo.purse) * 100)}%)</> : null}
            {espnInfo.name && t && !sameEvent(espnInfo.name, t.name) && (
              <div style={{ color: 'var(--warn-fg)', marginTop: 4 }}>Check this is the right event: you picked {t.name}.</div>
            )}
          </div>
        )}
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
                  setEspn(null);
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

