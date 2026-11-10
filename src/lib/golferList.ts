import { FLIGHTS, type Flight } from './scoring';

const ALIASES: Record<string, Flight> = { SUPER: 'SUPER', 'SUPER FLIGHT': 'SUPER', S: 'SUPER', A: 'A', B: 'B', C: 'C', D: 'D', E: 'E' };

export interface ParsedGolfers {
  rows: { name: string; flight: Flight }[];
  errors: string[];
}

/** Parse pasted lines like "Scottie Scheffler, Super" or "Scottie Scheffler<TAB>A" (e.g. copied from Excel). */
export function parseGolferList(text: string): ParsedGolfers {
  const rows: ParsedGolfers['rows'] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const parts = line.split(/\t|,/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) return void errors.push(`Line ${i + 1}: needs a name and a flight ("${line.trim()}")`);
    const flight = ALIASES[parts[parts.length - 1].toUpperCase()];
    const name = parts.slice(0, -1).join(', ');
    if (!flight) return void errors.push(`Line ${i + 1}: "${parts[parts.length - 1]}" isn't a flight (use ${FLIGHTS.join(', ')})`);
    if (seen.has(name.toLowerCase())) return void errors.push(`Line ${i + 1}: ${name} is listed twice`);
    seen.add(name.toLowerCase());
    rows.push({ name, flight });
  });
  return { rows, errors };
}

export const golferListText = (golfers: { name: string; flight: Flight }[]) =>
  golfers.map((g) => `${g.name}, ${g.flight === 'SUPER' ? 'Super' : g.flight}`).join('\n');
