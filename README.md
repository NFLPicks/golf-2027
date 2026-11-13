# Golf Fantasy 2027

App to run our fantasy golf league instead of the Excel sheet.

## How the league works
- Six flights: Super, A, B, C, D, E. Each owner has a **starter** and an **alternate** in every flight.
- Each tournament, one golfer per flight counts: the starter if he's in the field, otherwise the alternate automatically.
- A starter who misses the cut or withdraws counts as $0 (the alternate is not used).
- Before the first tee time, owners can swap:
  - **This week only**: the alternate counts for that one tournament.
  - **Permanent**: starter and alternate trade places until swapped back.
- Score = official prize money. Each tournament has its own weekly winner (two-event weeks pay twice).

## Code
- `src/lib/scoring.ts` – all scoring rules, in one place.
- `test/scoring.test.ts` – rule tests plus a full replay of the 2026 season against the old spreadsheet
  (owner names anonymized in `test/fixtures/season2026.json`).
- `supabase/schema.sql` – database tables and functions. RLS on everywhere; the browser only calls functions.

```
npm install
npm test        # rules + 2026 replay
npm run dev     # local app (needs VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
```

## App
- **Standings**: season table, $ behind first, flight totals (gold = flight leader), weekly winners.
- **My team**: owners sign in with name + PIN and pick, per flight, *Start* / *Swap this week* / *Swap permanently*
  for any tournament that hasn't hit its first tee time. Other owners see swaps only after the lock.
- **Commissioner**: PIN-protected; enter a swap for any owner (works after the lock to fix mistakes).

Merging to `main` builds and deploys to GitHub Pages (https://nflpicks.github.io/golf-2027/).

## Automatic results (Mondays)

`.github/workflows/results.yml` runs `scripts/pull-results.ts` Monday and Tuesday at 14:00 UTC. For each finished tournament without final results it finds the event on ESPN (by dates, then name), and saves the results only if ESPN says final and the prize money is within 85-120% of the purse. Anything else is listed in the run summary and the run fails, so GitHub emails the commissioner, who can use **Pull** on the Results screen instead.

Setup: add the commissioner PIN as the repository secret `GOLF_ADMIN_PIN` (Settings > Secrets and variables > Actions). Actions > "Pull results from ESPN" > Run workflow does a dry run by default.
