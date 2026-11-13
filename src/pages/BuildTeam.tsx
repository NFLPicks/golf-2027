import { useEffect, useState } from 'react';
import { getMyDraft, saveMyDraft, submitMyDraft, type League, type MyDraft } from '../lib/api';
import { emptyDraft, flightsDone, flipSlot, slotDone, tapGolfer, toDraft, type Draft, type Slot } from '../lib/draft';
import { FLIGHT_LABELS, FLIGHTS, normalizeName, type Flight } from '../lib/scoring';
import { Headshot } from '../components/Images';

const flightName = (f: Flight) => (f === 'SUPER' ? 'SUPER' : `FLIGHT ${f}`);
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';

/** Preseason: pick a starter and an alternate in every flight, saved as you go, then submit once. */
export default function BuildTeam({ league, name, pin, onSubmitted }: { league: League; name: string; pin: string; onSubmitted: () => void }) {
  const [mine, setMine] = useState<MyDraft | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [open, setOpen] = useState<Flight | null>(null);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const d = await getMyDraft(name, pin);
    setMine(d);
    const dr = toDraft(d.picks);
    setDraft(dr);
    setOpen((o) => o ?? FLIGHTS.find((f) => !slotDone(dr[f])) ?? null);
  };
  useEffect(() => { load().catch((e) => setError((e as Error).message)); }, [name, pin]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mine) return <div className="card muted">{error || 'Loading…'}</div>;
  const deadline = mine.deadline ?? league.season?.picks_deadline ?? null;
  const closed = Boolean(deadline && new Date(deadline) <= new Date());
  const pool = (f: Flight) => league.golfers.filter((g) => g.flight === f).map((g) => g.name);

  if (!league.golfers.length) return <div className="card muted">The commissioner hasn't loaded this season's golfers yet. Check back soon.</div>;

  // Submitted (or too late): show the team, read-only.
  if (mine.submittedAt || closed) {
    return (
      <>
        <div className="card ok" style={{ marginTop: 0 }}>
          {mine.submittedAt
            ? <>Team submitted {when(mine.submittedAt)}. {deadline && !closed ? `Everyone's rosters are revealed ${when(deadline)}.` : ''}</>
            : <>The picks deadline has passed. Ask the commissioner if your team still needs to be entered.</>}
        </div>
        {FLIGHTS.map((f) => <Picked key={f} flight={f} slot={draft[f]} />)}
      </>
    );
  }

  const save = async (f: Flight, slot: Slot) => {
    const prev = draft[f];
    setDraft({ ...draft, [f]: slot });
    setError(''); setStatus('Saving…'); setConfirming(false);
    try {
      await saveMyDraft(name, pin, f, slot.starter, slot.alternate);
      setStatus('Draft saved');
      if (slotDone(slot) && !slotDone(prev)) { setOpen(FLIGHTS.find((x) => x !== f && !slotDone(draft[x])) ?? null); setFilter(''); }
    } catch (e) {
      setDraft((d) => ({ ...d, [f]: prev }));
      setStatus(''); setError((e as Error).message);
    }
  };

  const done = flightsDone(draft);
  const submit = async () => {
    setBusy(true); setError('');
    try { await submitMyDraft(name, pin); await load(); onSubmitted(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); setConfirming(false); }
  };

  return (
    <>
      <div className="card" style={{ marginTop: 0, padding: '10px 12px' }}>
        <b>Build your team.</b> Pick 2 golfers in each flight. The first one you pick starts; the second is your alternate.
        Your picks save as you go and nobody else sees them. {deadline ? <>Picks are due <b>{when(deadline)}</b>.</> : null}
      </div>
      {FLIGHTS.map((f) => {
        const slot = draft[f];
        const isOpen = open === f;
        const list = pool(f).filter((g) => !filter || normalizeName(g).includes(normalizeName(filter)));
        return (
          <section className="fcard" key={f} aria-label={`${FLIGHT_LABELS[f]} flight`}>
            <div className="fhead">
              <span className="fname">{flightName(f)}</span>
              <span className="tag">{slotDone(slot) ? '✓ DONE' : `${Number(!!slot.starter) + Number(!!slot.alternate)}/2`}</span>
            </div>
            {([['STARTER', slot.starter], ['ALTERNATE', slot.alternate]] as const).map(([role, g]) => (
              <div key={role} className="grow">
                {g ? <Headshot name={g} size={30} /> : <span className="avatar" style={{ width: 30, height: 30 }} />}
                <span style={{ flex: 1, minWidth: 0 }}>
                  {g ? <span className="gname">{g}</span> : <span className="muted small">Pick your {role.toLowerCase()}</span>}
                  <span className="role">{role}</span>
                </span>
              </div>
            ))}
            <div className="row" style={{ padding: '6px 10px 8px', borderTop: '1px solid var(--line)', gap: 6 }}>
              <button className="chipbtn" onClick={() => { setOpen(isOpen ? null : f); setFilter(''); }}>{isOpen ? 'Done' : slot.starter ? 'Change' : 'Choose golfers'}</button>
              {slotDone(slot) && <button className="chipbtn" onClick={() => void save(f, flipSlot(slot))}>⇅ Switch starter</button>}
            </div>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--line)' }}>
                {pool(f).length > 12 && (
                  <div style={{ padding: '6px 10px' }}>
                    <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search this flight" aria-label={`Search ${FLIGHT_LABELS[f]} flight`} style={{ width: '100%' }} />
                  </div>
                )}
                {list.map((g) => {
                  const mark = slot.starter === g ? 'STARTER' : slot.alternate === g ? 'ALT' : '';
                  return (
                    <button key={g} className="grow pickrow" aria-pressed={!!mark} onClick={() => void save(f, tapGolfer(slot, g))}>
                      <Headshot name={g} size={28} />
                      <span style={{ flex: 1, textAlign: 'left' }}>{g}</span>
                      {mark && <span className="pick">{mark}</span>}
                    </button>
                  );
                })}
                {!list.length && <div className="grow muted small">No golfer matches “{filter}”.</div>}
              </div>
            )}
          </section>
        );
      })}
      {error && <div className="card error">{error}</div>}
      <div style={done === 6 ? { position: 'sticky', bottom: 68, zIndex: 5 } : undefined}>
        {confirming ? (
          <div className="card" style={{ margin: 0, boxShadow: '0 4px 14px rgba(0,0,0,.25)' }}>
            <b>Submit your team?</b> This is final for the season. After this, only swaps change your lineup.
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" disabled={busy} onClick={() => void submit()}>{busy ? 'Submitting…' : 'Yes, submit'}</button>
              <button className="btn ghost" disabled={busy} onClick={() => setConfirming(false)}>Not yet</button>
            </div>
          </div>
        ) : (
          <button className="bigbtn" disabled={done < 6} onClick={() => setConfirming(true)} style={{ width: '100%', ...(done === 6 ? { boxShadow: '0 4px 14px rgba(0,0,0,.25)' } : { opacity: 0.5 }) }}>
            {done === 6 ? 'Submit my team' : `${done} of 6 flights picked`}
          </button>
        )}
      </div>
      {status && <p className="small muted" role="status" style={{ margin: '0 4px' }}>{status}</p>}
    </>
  );
}

function Picked({ flight, slot }: { flight: Flight; slot: Slot }) {
  return (
    <section className="fcard" aria-label={`${FLIGHT_LABELS[flight]} flight`}>
      <div className="fhead"><span className="fname">{flightName(flight)}</span></div>
      {([['STARTER', slot.starter], ['ALTERNATE', slot.alternate]] as const).map(([role, g]) => (
        <div key={role} className="grow">
          {g && <Headshot name={g} size={30} />}
          <span style={{ flex: 1 }}><span className="gname">{g ?? '—'}</span><span className="role">{role}</span></span>
        </div>
      ))}
    </section>
  );
}
