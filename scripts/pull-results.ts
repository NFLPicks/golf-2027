/**
 * Monday job: for each finished tournament without final results, find it on ESPN,
 * and save the results if ESPN says it's final and the money adds up.
 * Run with: npx vite-node scripts/pull-results.ts   (GOLF_ADMIN_PIN required; DRY_RUN=1 to only report)
 * Anything it can't do safely is left for the commissioner's Results screen, and the run fails so GitHub emails him.
 */
import { adminSetResults, getLeague } from '../src/lib/api';
import { autoSaveProblem, dueForImport, espnLeaderboardUrl, parseEspnLeaderboard } from '../src/lib/espnParse';
import { nameCheck } from '../src/lib/resultsParse';
import { FLIGHTS } from '../src/lib/scoring';
import { env, findEspnEvent, getJson, run, say, usd } from './espn';

run(async () => {
  const { pin, dry, today } = env;
  if (!pin && !dry) throw new Error('GOLF_ADMIN_PIN is not set. Add it under the repo Settings > Secrets and variables > Actions.');
  const league = await getLeague();
  const due = dueForImport(league.tournaments, today);
  say(`## Results pull, ${today}${dry ? ' (dry run, nothing saved)' : ''}`);
  if (!due.length) { say('Nothing to do: no finished tournament is waiting for results.'); return true; }

  const rosterGolfers = league.rosters.flatMap((r) => FLIGHTS.flatMap((f) => [r.slots[f]?.starter, r.slots[f]?.alternate])).filter(Boolean) as string[];
  let ok = true;
  for (const t of due) {
    try {
      const { event: ev, sameWeek } = await findEspnEvent(t);
      if (!ev) {
        ok = false;
        say(`- **${t.name}**: couldn't tell which ESPN event this is${sameWeek.length ? `. Same week on ESPN: ${sameWeek.join(', ')}` : ''}. Use Pull on the Results screen.`);
        continue;
      }
      const r = parseEspnLeaderboard(await getJson(espnLeaderboardUrl(ev.id)));
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
});
