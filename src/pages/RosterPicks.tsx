import { useCallback, useEffect, useMemo, useState } from 'react';
import { getField, getMySwaps, setMySwap, type League, type MySwap } from '../lib/api';
import { weekStatus } from '../lib/fieldStatus';
import { golferMoney } from '../lib/home';
import { money, openTournaments } from '../lib/league';
import { changesFor, draftSwaps, savedChoices, type Choice, type Choices } from '../lib/picks';
import { FLIGHT_LABELS, FLIGHTS, scoreSeason, type Flight } from '../lib/scoring';
import GolferRow from '../components/GolferRow';

const OPTIONS: { value: Choice; label: string }[] = [
  { value: 'keep', label: 'Keep' },
  { value: 'week', label: 'This week' },
  { value: 'permanent', label: 'Permanent' },
];
const flightName = (f: Flight) => (f === 'SUPER' ? 'SUPER' : `FLIGHT ${f}`);

/** Roster & Picks: my lineup with Keep / This week / Permanent per flight and one Submit; plus every roster. */
export default function RosterPicks({ league, name, pin }: { league: League; name: string; pin: string }) {
  const [view, setView] = useState<'mine' | 'league'>('mine');
  const open = openTournaments(league.tournaments);
  const [tid, setTid] = useState<number | null>(open[0]?.id ?? null);
  const t = league.tournaments.find((x) => x.id === tid) ?? open[0];

  const lockText = t && new Date(t.lock_at).toLocaleString('en-US', {
    weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  });

  return (
    <>
      <div className="section-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <h2>ROSTER &amp; PICKS</h2>
        {t ? (
          open.length > 1 ? (
            <div className="row" style={{ gap: 6 }}>
              <select value={t.id} onChange={(e) => setTid(Number(e.target.value))} aria-label="Tournament" style={{ padding: '4px 8px' }}>
                {open.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <span className="small muted">locks {lockText} ET</span>
            </div>
          ) : <span className="small muted">{t.name} · lineups lock {lockText} ET</span>
        ) : <span className="small muted">No tournament is open for changes right now.</span>}
      </div>

      <div className="toggle" role="group" aria-label="Whose roster">
        <button aria-pressed={view === 'mine'} onClick={() => setView('mine')}>My Team</button>
        <button aria-pressed={view === 'league'} onClick={() => setView('league')}>
          League ({league.rosters.length})
        </button>
      </div>

      {view === 'mine' ? <MyPicks league={league} name={name} pin={pin} tid={t?.id ?? null} /> : <LeagueRosters league={league} me={name} />}
    </>
  );
}

function MyPicks({ league, name, pin, tid }: { league: League; name: string; pin: string; tid: number | null }) {
  const [mySwaps, setMySwaps] = useState<MySwap[] | null>(null);
  const [field, setField] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<Choices | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const roster = league.rosters.find((r) => r.owner === name);

  const load = useCallback(async () => {
    const s = await getMySwaps(name, pin);
    setMySwaps(s);
    if (tid !== null) setDraft(savedChoices(s, tid));
  }, [name, pin, tid]);
  useEffect(() => { load().catch((e) => setError((e as Error).message)); }, [load]);
  useEffect(() => {
    setField(null);
    if (tid !== null) getField(tid).then(setField).catch(() => setField([]));
  }, [tid]);

  const cash = useMemo(() => {
    if (!roster) return new Map<string, { pga: number; mine: number }>();
    const season = scoreSeason({ rosters: league.rosters, swaps: league.swaps, results: league.results, aliases: league.aliases });
    return golferMoney(FLIGHTS.flatMap((f) => [roster.slots[f].starter, roster.slots[f].alternate]), name, league.results, season, league.aliases);
  }, [league, roster, name]);

  if (!roster) return <div className="card muted">Your roster hasn't been entered yet.</div>;
  if (tid === null) return <div className="card muted">Lineups are locked. You can make changes again once this week's tournament is over.</div>;
  if (!mySwaps || !draft) return <div className="card muted">{error || 'Loading…'}</div>;

  const flights = weekStatus(roster, draftSwaps(name, mySwaps, tid, draft), tid, field, league.aliases);
  const changes = changesFor(roster, mySwaps, tid, draft);
  const savedNow = savedChoices(mySwaps, tid);

  const submit = async () => {
    setBusy(true);
    setError('');
    setSaved('');
    try {
      for (const c of changes) await setMySwap(name, pin, tid, c.flight, c.kind);
      setSaved(changes.map((c) => c.text).join(' · '));
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {saved && <div className="card ok" role="status" style={{ marginTop: 0 }}>Saved. {saved}</div>}
      {flights.map((f) => {
        const choice = draft[f.flight];
        // Show the golfer who'd count (if both play) on top.
        const swapped = choice !== 'keep' || f.weekSwap;
        const top = choice === 'week' ? f.alternate : f.starter;
        const bottom = choice === 'week' ? f.starter : f.alternate;
        const topIn = choice === 'week' ? f.alternateIn : f.starterIn;
        const bottomIn = choice === 'week' ? f.starterIn : f.alternateIn;
        const tag = choice === 'week' ? ' · THIS WEEK' : choice === 'permanent' ? ' · PERMANENT' : '';
        const neither = f.starterIn === 'out' && f.alternateIn === 'out';
        const topOut = swapped && topIn === 'out' && bottomIn !== 'out';
        return (
          <section className="fcard" key={f.flight} aria-label={`${FLIGHT_LABELS[f.flight]} flight`}>
            <div className="fhead">
              <span className="fname">{flightName(f.flight)}</span>
              {choice !== savedNow[f.flight] && <span className="tag">UNSAVED</span>}
            </div>
            {([['STARTER', top, topIn], ['ALTERNATE', bottom, bottomIn]] as const).map(([role, g, inField]) => {
              const m = cash.get(g) ?? { pga: 0, mine: 0 };
              return <GolferRow key={role} name={g} role={role + tag} inField={inField} counts={f.counts === g} pga={m.pga} mine={m.mine} />;
            })}
            <div style={{ padding: '6px 10px 8px', borderTop: '1px solid var(--line)' }}>
              <div className="seg" role="radiogroup" aria-label={`${FLIGHT_LABELS[f.flight]} flight choice`} style={{ marginTop: 0, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', width: '100%' }}>
                {OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    role="radio"
                    aria-checked={choice === o.value}
                    className={choice === o.value ? 'on' : ''}
                    disabled={busy}
                    onClick={() => { setDraft({ ...draft, [f.flight]: o.value }); setSaved(''); }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {neither && <div className="small" style={{ color: 'var(--out-fg)', marginTop: 6 }}>Neither golfer is in the field. This flight scores $0 unless one is added.</div>}
              {!neither && topOut && (
                <div className="small" style={{ color: 'var(--warn-fg)', marginTop: 6 }}>
                  {top} isn't in the field. If he's still out at the lock, {bottom} plays instead.
                </div>
              )}
            </div>
          </section>
        );
      })}
      {error && <div className="card error">{error}</div>}
      {/* Stays visible above the nav while there are unsaved changes. */}
      <div style={changes.length ? { position: 'sticky', bottom: 68, zIndex: 5 } : undefined}>
        <button className="bigbtn" disabled={busy || !changes.length} onClick={() => void submit()} style={{ width: '100%', ...(changes.length ? { boxShadow: '0 4px 14px rgba(0,0,0,.25)' } : { opacity: 0.5 }) }}>
          {busy ? 'Saving…' : changes.length ? `Submit ${changes.length} change${changes.length > 1 ? 's' : ''}` : 'No changes to submit'}
        </button>
      </div>
      {changes.length > 0 && <p className="small muted" style={{ margin: '0 4px' }}>{changes.map((c) => c.text).join(' · ')}</p>}
      <p className="small muted" style={{ margin: '0 4px' }}>
        If your starter isn't playing, your alternate counts automatically. You don't need to swap. Other owners see your moves once lineups lock.
      </p>
    </>
  );
}

function LeagueRosters({ league, me }: { league: League; me: string }) {
  const season = useMemo(
    () => scoreSeason({ rosters: league.rosters, swaps: league.swaps, results: league.results, aliases: league.aliases }),
    [league],
  );
  const byId = new Map(league.tournaments.map((t) => [t.id, t]));
  const nextId = Math.max(0, ...league.tournaments.map((t) => t.id)) + 1;

  return (
    <>
      <p className="small muted" style={{ margin: '0 4px' }}>Current starters in bold. This week's swaps appear after the lock.</p>
      {season.standings.map((row) => {
        const roster = league.rosters.find((r) => r.owner === row.owner)!;
        const lineup = weekStatus(roster, league.swaps, nextId, null);
        const moves = league.swaps
          .filter((s) => s.owner === row.owner)
          .sort((a, b) => b.tournamentId - a.tournamentId)
          .slice(0, 6);
        return (
          <section className="fcard" key={row.owner} style={row.owner === me ? { outline: '2px solid var(--brand)' } : undefined}>
            <div className="fhead">
              <span className="fname" style={{ fontStyle: 'normal' }}>{row.rank} · {row.owner}</span>
              <span className="tag">{money(row.total)}</span>
            </div>
            <div style={{ padding: '4px 10px 8px' }}>
              {lineup.map((f) => (
                <div key={f.flight} style={{ display: 'grid', gridTemplateColumns: '52px 1fr 1fr', gap: 6, fontSize: 13, padding: '3px 0', borderBottom: '1px solid var(--line)' }}>
                  <span className="muted" style={{ fontWeight: 700, fontSize: 11 }}>{f.flight === 'SUPER' ? 'SUPER' : f.flight}</span>
                  <b>{f.starter}</b>
                  <span className="muted">{f.alternate}</span>
                </div>
              ))}
              <div className="small" style={{ marginTop: 6 }}>
                <span className="muted" style={{ fontWeight: 700, fontSize: 11, letterSpacing: 0.5 }}>MOVES </span>
                {moves.length
                  ? moves.map((s) => `${byId.get(s.tournamentId)?.name ?? `#${s.tournamentId}`}: ${FLIGHT_LABELS[s.flight]} ${s.kind === 'week' ? 'this week' : 'permanent'}`).join(' · ')
                  : <span className="muted">None yet</span>}
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
