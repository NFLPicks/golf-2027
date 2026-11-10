import { normalizeName, type ResultRow } from './scoring';

export interface ParsedResults {
  rows: (ResultRow & { position: string | null })[];
  warnings: string[];
}

const MONEY = /^\$?\s*\d{1,3}(,\d{3})*(\.\d+)?$|^\$?\s*\d+(\.\d+)?$/;
const toMoney = (s: string): number | null => {
  const t = s.trim();
  if (!t || /^-+$/.test(t) || !MONEY.test(t)) return null;
  return Number(t.replace(/[$,\s]/g, ''));
};

/**
 * Parse a leaderboard copied from ESPN (or Excel). Lines are split on tabs.
 * Uses the header row (PLAYER ... EARNINGS) when present; otherwise expects "Name<TAB>Earnings".
 * Golfers who missed the cut / withdrew have no earnings ("--") but are still in the field.
 */
export function parseLeaderboard(text: string): ParsedResults {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
  const split = (l: string) => (l.includes('\t') ? l.split('\t') : l.split(/\s{2,}/)).map((c) => c.trim());
  const warnings: string[] = [];
  const rows: ParsedResults['rows'] = [];
  const seen = new Set<string>();

  let player = -1;
  let earnings = -1;
  let pos = -1;
  let start = 0;
  const headerIdx = lines.findIndex((l) => /player/i.test(l) && /earnings/i.test(l));
  if (headerIdx >= 0) {
    const h = split(lines[headerIdx]).map((c) => c.toUpperCase());
    player = h.indexOf('PLAYER');
    earnings = h.indexOf('EARNINGS');
    pos = h.indexOf('POS');
    start = headerIdx + 1;
  }

  for (const line of lines.slice(start)) {
    const cells = split(line);
    if (/player/i.test(line) && /earnings/i.test(line)) continue; // repeated header
    let name: string | undefined;
    let money: number | null = null;
    let position: string | null = null;
    if (player >= 0) {
      // Rows can carry an extra leading empty cell; realign on the name if needed.
      let off = 0;
      const looksLikeName = (s?: string) => !!s && /[a-z]/i.test(s) && /\s/.test(s.trim());
      if (!looksLikeName(cells[player]) && looksLikeName(cells[player + 1])) off = 1;
      name = cells[player + off];
      money = earnings >= 0 ? toMoney(cells[earnings + off] ?? '') : null;
      position = pos >= 0 ? cells[pos + off] || null : null;
    } else {
      // "Name<TAB>Earnings" (two columns from Excel)
      name = cells.find((c) => /[a-z]/i.test(c) && /\s/.test(c));
      money = toMoney(cells[cells.length - 1] ?? '');
    }
    if (!name) {
      warnings.push(`Skipped a line I couldn't read: "${line.slice(0, 60)}"`);
      continue;
    }
    const key = normalizeName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ golfer: name, earnings: money, position });
  }
  if (rows.length && rows.every((r) => r.earnings === null)) warnings.push('No prize money found. Is the EARNINGS column included?');
  return { rows, warnings };
}

/** Roster golfers whose name doesn't appear in the results, with possible matches (same last name). */
export function nameCheck(rosterGolfers: string[], results: ResultRow[], aliases: Record<string, string> = {}) {
  const aliasTo = new Map(Object.entries(aliases).map(([a, g]) => [normalizeName(a), normalizeName(g)]));
  const inResults = new Set(results.map((r) => aliasTo.get(normalizeName(r.golfer)) ?? normalizeName(r.golfer)));
  const last = (n: string) => normalizeName(n).split(' ').slice(-1)[0];
  return [...new Set(rosterGolfers)]
    .filter((g) => !inResults.has(normalizeName(g)))
    .map((g) => ({
      golfer: g,
      maybe: results.filter((r) => last(r.golfer) === last(g)).map((r) => r.golfer),
    }))
    .sort((a, b) => b.maybe.length - a.maybe.length || a.golfer.localeCompare(b.golfer));
}
