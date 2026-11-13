/**
 * Daily job (Mon-Thu, before the lock): post this week's field from ESPN so owners see
 * In field / Not in field. Re-posts each run, which picks up withdrawals.
 * Run with: npx vite-node scripts/pull-field.ts   (GOLF_ADMIN_PIN required; DRY_RUN=1 to only report)
 * ESPN not having the field yet is normal early in the week and isn't an error.
 */
import { adminSetField, getField, getLeague } from '../src/lib/api';
import { dueForField, espnFieldNames, espnLeaderboardUrl, MIN_FIELD } from '../src/lib/espnParse';
import { isLocked } from '../src/lib/league';
import { normalizeName } from '../src/lib/scoring';
import { env, findEspnEvent, getJson, run, say } from './espn';

run(async () => {
  const { pin, dry, today } = env;
  if (!pin && !dry) throw new Error('GOLF_ADMIN_PIN is not set. Add it under the repo Settings > Secrets and variables > Actions.');
  const league = await getLeague();
  // Never change the field after the lock: by then it no longer matters, and results decide scoring.
  const due = dueForField(league.tournaments, today).filter((t) => !isLocked(t));
  say(`## Field pull, ${today}${dry ? ' (dry run, nothing saved)' : ''}`);
  if (!due.length) { say('Nothing to do: no tournament starts in the next 6 days.'); return true; }

  let ok = true;
  for (const t of due) {
    try {
      const { event: ev, sameWeek } = await findEspnEvent(t);
      if (!ev) {
        say(`- **${t.name}**: couldn't tell which ESPN event this is${sameWeek.length ? `. Same week on ESPN: ${sameWeek.join(', ')}` : ''}. Paste the field on the Weekly field screen.`);
        ok = false;
        continue;
      }
      const names = espnFieldNames(await getJson(espnLeaderboardUrl(ev.id)));
      if (names.length < MIN_FIELD) { say(`- **${t.name}**: ESPN hasn't posted the field yet (${names.length} names). Will try again next run.`); continue; }
      const before = await getField(t.id);
      const had = new Set(before.map(normalizeName));
      const now = new Set(names.map(normalizeName));
      const added = names.filter((n) => !had.has(normalizeName(n)));
      const dropped = before.filter((n) => !now.has(normalizeName(n)));
      if (before.length && !added.length && !dropped.length) { say(`- **${t.name}**: field unchanged (${names.length} golfers).`); continue; }
      if (!dry) await adminSetField(pin, t.id, names);
      say(`- **${t.name}** → ESPN ${ev.name} (${ev.id}): ${dry ? 'would post' : 'posted'} ${names.length} golfers.`
        + (before.length ? ` Added: ${added.join(', ') || 'none'}. Dropped: ${dropped.join(', ') || 'none'}.` : ''));
    } catch (e) {
      ok = false;
      say(`- **${t.name}**: failed (${(e as Error).message}). Paste the field on the Weekly field screen.`);
    }
  }
  return ok;
});
