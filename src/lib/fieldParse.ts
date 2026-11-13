import { normalizeName } from './scoring';

export interface ParsedField {
  names: string[];
  skipped: string[];
}

const HEADER = /^(player|players|name|field|golfer|pos|position|country|tee time|round \d)$/i;
const looksLikeName = (s: string) => /[a-z]/i.test(s) && /\s/.test(s.trim()) && !/\d{1,2}:\d{2}/.test(s) && !HEADER.test(s.trim());

/**
 * Read a pasted tournament field: one golfer per line, or rows copied from a field / tee-time page
 * (the first name-looking cell on each line is used). Amateur marks like "(a)" are dropped, duplicates ignored.
 */
export function parseField(text: string): ParsedField {
  const names: string[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = (line.includes('\t') ? line.split('\t') : line.split(/\s{2,}/)).map((c) => c.trim());
    const cell = cells.find(looksLikeName);
    if (!cell) {
      if (!cells.every((c) => HEADER.test(c) || !c)) skipped.push(line.slice(0, 60));
      continue;
    }
    const name = cell.replace(/\s*\((a|am|amateur)\)\s*$/i, '').replace(/\s*\*+$/, '').replace(/\s+/g, ' ').trim();
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return { names, skipped };
}
