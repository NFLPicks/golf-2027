import { useEffect, useMemo, useState } from 'react';
import { getField, getMySwaps, type League, type MySwap } from '../lib/api';
import { weekStatus, type WeekFlight } from '../lib/fieldStatus';
import { currentTournament, dateRange, golferMoney, timeLeft } from '../lib/home';
import { isLocked, money } from '../lib/league';
import { FLIGHT_LABELS, FLIGHTS, scoreSeason } from '../lib/scoring';
import { CheckIcon, ClockIcon, ExternalIcon, LockIcon, PencilIcon, XIcon } from '../components/Icons';
import { EventLogo, Headshot } from '../components/Images';
import type { Session } from './Login';

const TAGS: Record<WeekFlight['summary'], string> = {
  both: 'BOTH IN FIELD',
  'starter-in': 'STARTER IN',
  'alternate-in': 'ALTERNATE IN',
  none: 'NONE IN FIELD',
  pending: 'FIELD NOT POSTED',
};

/** Home: this week's event and my lineup, read-only. Changes happen on Roster & Picks. */
export default function Home({ league, session, onEdit }: { league: League; session: Session; onEdit: () => void }) {
  const t = currentTournament(league.tournaments);
  const [field, setField] = useState<string[] | null>(null);
  const [mySwaps, setMySwaps] = useState<MySwap[]>([]);
  const [showField, setShowField] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setField(null);
    if (t) getField(t.id).then(setField).catch(() => setField([]));
  }, [t?.id]);
  useEffect(() => {
    if (session.kind === 'owner') getMySwaps(session.name, session.pin).then(setMySwaps).catch(() => setMySwaps([]));
  }, [session]);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const owner = session.kind === 'owner' ? session.name : null;
  const roster = league.rosters.find((r) => r.owner === owner);
  // Before the lock, other owners' swaps are hidden, so use my own list for my lineup.
  const swaps = useMemo(
    () => (owner ? [...league.swaps.filter((s) => s.owner !== owner), ...mySwaps.map((s) => ({ ...s, owner }))] : league.swaps),
    [league.swaps, mySwaps, owner],
  );
  const season = useMemo(
    () => scoreSeason({ rosters: league.rosters, swaps, results: league.results, aliases: league.aliases }),
    [league, swaps],
  );

  if (!t) return <div className="card muted">The schedule hasn't been posted yet.</div>;
  const locked = isLocked(t, now);
  const flights = roster ? weekStatus(roster, swaps, t.id, field, league.aliases) : [];
  const cash = roster && owner
    ? golferMoney(FLIGHTS.flatMap((f) => [roster.slots[f].starter, roster.slots[f].alternate]), owner, league.results, season, league.aliases)
    : new Map<string, { pga: number; mine: number }>();
  const lockText = new Date(t.lock_at).toLocaleString('en-US', {
    weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  });

  return (
    <>
      <section className="event" aria-label="This week">
        <div className="event-top">
          <EventLogo t={t} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="kicker">EVENT {t.id} · {dateRange(t)}</span>
            <h1 className="display">{t.name.toUpperCase()}</h1>
            {(t.course || t.location) && <span className="where">{[t.course, t.location].filter(Boolean).join(' · ')}</span>}
          </div>
        </div>
        {(t.purse || t.defending_champion) && (
          <div className="facts">
            {t.purse ? <span>Purse <b className="display">{money(Number(t.purse))}</b></span> : null}
            {t.defending_champion && <span>Defending <b>{t.defending_champion}</b></span>}
          </div>
        )}
        <div className="event-foot">
          {locked ? (
            <span className="lockline locked"><LockIcon size={14} />{t.status === 'final' ? 'Final' : 'Locked · Round 1 underway'}</span>
          ) : (
            <span className="lockline"><ClockIcon size={14} />Locks {lockText} ET · {timeLeft(t.lock_at, now)}</span>
          )}
          <div className="event-links">
            {field && field.length > 0 ? (
              <button className="chipbtn" aria-expanded={showField} onClick={() => setShowField((v) => !v)}>{showField ? 'Hide field' : 'Field'}</button>
            ) : t.field_url ? (
              <a className="chipbtn" href={t.field_url} target="_blank" rel="noreferrer">Field</a>
            ) : null}
            <a className="chipbtn solid" href="https://www.pgatour.com/leaderboard" target="_blank" rel="noreferrer">PGA TOUR <ExternalIcon size={13} /></a>
          </div>
        </div>
        {showField && field && <p className="small muted" style={{ margin: 0 }}>{field.length} golfers: {field.join(', ')}</p>}
      </section>

      <div className="section-head">
        <h2>MY LINEUP</h2>
        {roster && (locked ? (
          <span className="lockedtag"><LockIcon /> Locked</span>
        ) : (
          <button className="bigbtn" style={{ padding: '0 16px', fontSize: 14 }} onClick={onEdit}><PencilIcon /> Edit lineup</button>
        ))}
      </div>

      {!owner && <div className="card muted">You're signed in as the commissioner. Sign in as an owner to see a lineup.</div>}
      {owner && !roster && <div className="card muted">Your roster hasn't been entered yet. The commissioner will set it up before the season.</div>}
      {flights.map((f) => (
        <section className="fcard" key={f.flight} aria-label={`${FLIGHT_LABELS[f.flight]} flight`}>
          <div className="fhead">
            <span className="fname">{f.flight === 'SUPER' ? 'SUPER' : `FLIGHT ${f.flight}`}</span>
            <span className={`tag ${f.summary === 'none' ? 'bad' : ''}`}>
              {f.weekSwap && f.summary !== 'none' ? 'SWAPPED THIS WEEK' : TAGS[f.summary]}
            </span>
          </div>
          {([['starter', f.starter, f.starterIn], ['alternate', f.alternate, f.alternateIn]] as const).map(([role, name, inField]) => {
            const counts = f.counts === name;
            const m = cash.get(name) ?? { pga: 0, mine: 0 };
            return (
              <div className={`grow ${counts ? 'counts' : ''}`} key={role}>
                <Headshot name={name} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div>
                    <span className="gname">{name}</span>
                    <span className="role">{role === 'starter' ? 'STARTER' : 'ALTERNATE'}</span>
                  </div>
                  <span className="money">PGA {money(m.pga)} · For you <b>{money(m.mine)}</b></span>
                </div>
                <div className="badges">
                  {inField === 'in' && <span className="badge in"><CheckIcon /> In Field</span>}
                  {inField === 'out' && <span className="badge out"><XIcon /> Not In Field</span>}
                  {inField === 'unknown' && <span className="badge wait">Field TBD</span>}
                  {counts && <span className="pick">YOUR PICK THIS WEEK</span>}
                </div>
              </div>
            );
          })}
        </section>
      ))}
      {roster && field !== null && field.length === 0 && (
        <p className="small muted" style={{ margin: '0 4px' }}>
          The field isn't posted yet. “Your pick” shows who counts if both golfers play; your alternate counts automatically if your starter doesn't.
        </p>
      )}
    </>
  );
}
