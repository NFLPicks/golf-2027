/**
 * Monday job: for each finished tournament without final results, find it on ESPN,
 * and save the results if ESPN says it's final and the money adds up.
 * Run with: npx vite-node scripts/pull-results.ts   (GOLF_ADMIN_PIN required; DRY_RUN=1 to only report)
 * Anything it can't do safely is left for the commissioner's Results screen, and the run fails so GitHub emails him.
 */
import { appendFileSync } from 'node:fs';
import { adminSetResults, getLeague } from '../src/lib/api';
import {
  autoSaveProblem, dueForImport, espnEvents, espnLeaderboardUrl, espnScoreboardUrl, matchEspnEvent, parseEspnLeaderboard, type EspnEvent,
} from '../src/lib/espnParse';
import { endDay } from '../src/lib/home';
import { nameCheck } from '../src/lib/resultsParse';
import { FLIGHTS } from '../src/lib/scoring';

/** ESPN's current/most recent leaderboard (no event ID); a fallback for finding the event. */
const CURRENT_LEADERBOARD = 'https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga';

const pin = process.env.GOLF_ADMIN_PIN ?? '';
const dry = /^(1|true|yes)$/i.test(process.env.DRY_RUN ?? '');
const today = process.env.TODAY ?? new Date().toISOString().slice(0, 10);
const lines: string[] = [];
const say = (s: string) => { console.log(s); lines.push(s); };
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

async function json(url: string) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

async function main() {
  if (!pin && !dry) throw new Error('GOLF_ADMIN_PIN is not set. Add it under the repo Settings > Secrets and variables > Actions.');
  const league = await getLeague();
  const due = dueForImport(league.tournaments, today);
  say(`## Results pull, ${today}${dry ? ' (dry run, nothing saved)' : ''}`);
  if (!due.length) { say('Nothing to do: no finished tournament is waiting for results.'); return true; }

  const rosterGolfers = league.rosters.flatMap((r) => FLIGHTS.flatMap((f) => [r.slots[f]?.starter, r.slots[f]?.alternate])).filter(Boolean) as string[];
  let ok = true;
  for (const t of due) {
    try {
      const end = endDay(t);
      // ESPN's calendar for that week, plus the current leaderboard as a fallback.
      const events: EspnEvent[] = [];
      for (const url of [espnScoreboardUrl(t.start_date), CURRENT_LEADERBOARD]) {
        try { events.push(...espnEvents(await json(url))); } catch (e) { console.log(`(skipped ${url}: ${(e as Error).message})`); }
      }
      const ev = matchEspnEvent({ name: t.name, start: t.start_date, end }, events);
      if (!ev) {
        ok = false;
        const near = events.filter((e) => e.start <= end && e.end >= t.start_date).map((e) => `${e.name} (${e.id})`);
        say(`- **${t.name}**: couldn't tell which ESPN event this is${near.length ? `. Same week on ESPN: ${[...new Set(near)].join(', ')}` : ''}. Use Pull on the Results screen.`);
        continue;
      }
      const r = parseEspnLeaderboard(await json(espnLeaderboardUrl(ev.id)));
      const problem = autoSaveProblem(r, t.purse);
      if (problem) {
        // Not final yet is normal on a Monday after a weather delay; anything else needs a look.
        if (r.final) ok = false;
        say(`- **${t.name}** → ESPN ${r.name} (${ev.id}): not saved. ${problem}`);
        continue;
      }
      const maybe = nameCheck(rosterGolfers, r.rows, league.aliases).filter((m) => m.maybe.length);
      if (!dry) await adminSetResults(pin, t.id, r.rows, true);
      say(`- **${t.name}** → ESPN ${r.name} (${ev.id}): ${dry ? 'would save' : 'saved'} ${r.rows.length} golfers, ${usd(r.paid)} paid${t.purse ? ` of a ${usd(Number(t.purse))} purse` : ''}.`);
      for (const m of maybe) say(`  - Check name: roster has "${m.golfer}", ESPN has ${m.maybe.map((x) => `"${x}"`).join(' / ')}. Link them on the Results screen if it's the same person.`);
    } catch (e) {
      ok = false;
      say(`- **${t.name}**: failed (${(e as Error).message}). Use Pull on the Results screen.`);
    }
  }
  return ok;
}

main()
  .then((ok) => { if (!ok) process.exitCode = 1; })
  .catch((e) => { say(`Failed: ${(e as Error).message}`); process.exitCode = 1; })
  .finally(() => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n'); });
