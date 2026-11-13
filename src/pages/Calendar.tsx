import { useMemo } from 'react';
import type { League, LeagueTournament } from '../lib/api';
import { calendarSections, dateRange } from '../lib/home';
import { money } from '../lib/league';
import { scoreSeason } from '../lib/scoring';
import { EventLogo } from '../components/Images';

/** Calendar: this week, what's coming up, and past events with the league's weekly winner. */
export default function Calendar({ league }: { league: League }) {
  const { past, thisWeek, upcoming } = calendarSections(league.tournaments);
  const winners = useMemo(() => {
    const s = scoreSeason({ rosters: league.rosters, swaps: league.swaps, results: league.results, aliases: league.aliases });
    return new Map(s.tournaments.map((t) => [t.tournamentId, t]));
  }, [league]);

  if (!league.tournaments.length) return <div className="card muted">The schedule hasn't been posted yet.</div>;

  const row = (t: LeagueTournament, detail: string) => (
    <div className="cal-row" key={t.id}>
      <EventLogo t={t} />
      <div className="what">
        <b>{t.name}</b>
        <span className="small muted">{dateRange(t)}{t.course ? ` · ${t.course}` : ''}{t.location ? `, ${t.location}` : ''}</span>
        {detail && <div className="small">{detail}</div>}
      </div>
    </div>
  );
  const upcomingDetail = (t: LeagueTournament) =>
    [t.purse ? `Purse ${money(Number(t.purse))}` : '', t.defending_champion ? `Defending: ${t.defending_champion}` : ''].filter(Boolean).join(' · ');
  const pastDetail = (t: LeagueTournament) => {
    const w = winners.get(t.id);
    return w?.winners.length ? `🏆 ${w.winners.join(' & ')} · ${money(w.topTotal)}` : t.status === 'final' ? '' : 'Results not in yet';
  };

  return (
    <>
      {thisWeek.length > 0 && (
        <div className="card">
          <h2>This week</h2>
          {thisWeek.map((t) => row(t, upcomingDetail(t)))}
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="card">
          <h2>Upcoming</h2>
          {upcoming.map((t) => row(t, upcomingDetail(t)))}
        </div>
      )}
      {past.length > 0 && (
        <div className="card">
          <h2>Past</h2>
          {past.map((t) => row(t, pastDetail(t)))}
        </div>
      )}
    </>
  );
}
