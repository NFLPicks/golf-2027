/** Shared pieces for the scheduled ESPN jobs (results and weekly field). */
import { appendFileSync } from 'node:fs';
import type { LeagueTournament } from '../src/lib/api';
import { espnEvents, espnScoreboardUrl, matchEspnEvent, type EspnEvent } from '../src/lib/espnParse';
import { endDay } from '../src/lib/home';

/** ESPN's current leaderboard (no event ID); a fallback for finding the event. */
const CURRENT_LEADERBOARD = 'https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga';

export const env = {
  pin: process.env.GOLF_ADMIN_PIN ?? '',
  dry: /^(1|true|yes)$/i.test(process.env.DRY_RUN ?? ''),
  today: process.env.TODAY ?? new Date().toISOString().slice(0, 10),
};

const lines: string[] = [];
export const say = (s: string) => { console.log(s); lines.push(s); };
export const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export async function getJson(url: string) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

/** Find our tournament on ESPN: that week's scoreboard calendar, then the current leaderboard. */
export async function findEspnEvent(t: LeagueTournament): Promise<{ event: EspnEvent | null; sameWeek: string[] }> {
  const end = endDay(t);
  const events: EspnEvent[] = [];
  for (const url of [espnScoreboardUrl(t.start_date), CURRENT_LEADERBOARD]) {
    try { events.push(...espnEvents(await getJson(url))); } catch (e) { console.log(`(skipped ${url}: ${(e as Error).message})`); }
  }
  const event = matchEspnEvent({ name: t.name, start: t.start_date, end }, events);
  const sameWeek = [...new Set(events.filter((e) => e.start <= end && e.end >= t.start_date).map((e) => `${e.name} (${e.id})`))];
  return { event, sameWeek };
}

/** Run a job: exit non-zero when it returns false or throws (so GitHub emails), and write the GitHub run summary. */
export function run(job: () => Promise<boolean>) {
  job()
    .then((ok) => { if (!ok) process.exitCode = 1; })
    .catch((e) => { say(`Failed: ${(e as Error).message}`); process.exitCode = 1; })
    .finally(() => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n'); });
}
