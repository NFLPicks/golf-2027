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
npm test
```
