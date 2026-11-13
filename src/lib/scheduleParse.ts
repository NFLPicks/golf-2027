export interface ScheduleRow {
  id: number;
  name: string;
  start: string; // YYYY-MM-DD
  end: string | null;
  lockAt: string; // ISO, UTC
  purse: number | null;
  course: string | null;
  location: string | null;
  champion: string | null;
  logo: string | null;
}

export interface ParsedSchedule {
  rows: ScheduleRow[];
  warnings: string[];
}

export const SCHEDULE_TEMPLATE = ['Event', 'Start', 'End', 'Course', 'Location', 'Purse', "Last year's champion"].join('\t');

const COLUMNS: Record<keyof Omit<ScheduleRow, 'lockAt'> | 'lock', RegExp> = {
  id: /^(#|no\.?|num(ber)?|week|event #)$/i,
  name: /^(event|tournament|name)$/i,
  start: /^(start|start date|date|begins?)$/i,
  end: /^(end|end date|ends?)$/i,
  lock: /^(lock|locks|lock time|first tee( time)?|tee time)$/i,
  course: /^(course|venue)$/i,
  location: /^(location|city|where)$/i,
  purse: /^(purse|prize money)$/i,
  champion: /^(last year'?s? champion|defending( champion)?|champion|last year'?s? winner|winner)$/i,
  logo: /^(logo|logo file)$/i,
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "2027-02-05", "2/5/2027", "2/5/27", "Feb 5, 2027", "February 5 2027" -> "2027-02-05". */
export function parseDate(s: string, defaultYear?: number): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : defaultYear;
    return y ? `${y}-${pad(+m[1])}-${pad(+m[2])}` : null;
  }
  m = t.match(/^([a-z]{3,9})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/i);
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    const y = m[3] ? +m[3] : defaultYear;
    return mo >= 0 && y ? `${y}-${pad(mo + 1)}-${pad(+m[2])}` : null;
  }
  return null;
}

/** "7:00 AM", "7am", "13:30" -> "07:00" / "13:30". */
export function parseTime(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?$/i);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (m[3]) h = (h % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0);
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
}

/** A wall-clock time in US Eastern on a date, as a UTC ISO string (handles daylight saving). */
export function easternToIso(date: string, time = '07:00'): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h + 5, mi); // EST first
  const off = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(guess))
    .find((p) => p.type === 'timeZoneName')?.value; // "GMT-5" or "GMT-4"
  const hours = off ? -Number(off.replace('GMT', '')) : 5;
  return new Date(Date.UTC(y, mo - 1, d, h + hours, mi)).toISOString();
}

const money = (s: string) => {
  const t = s.replace(/[$,\s]/g, '');
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)([mk])?$/i);
  if (!m) return null;
  return Math.round(+m[1] * (m[2]?.toLowerCase() === 'm' ? 1e6 : m[2]?.toLowerCase() === 'k' ? 1e3 : 1));
};

/**
 * Read a season schedule pasted from a spreadsheet (tab-separated, with a header row).
 * Required columns: Event and Start. Optional: #, End, Lock (first tee time, Eastern), Course, Location, Purse,
 * Last year's champion, Logo. Swaps lock at 7:00 AM Eastern on the start date unless a Lock time is given.
 * Without a # column, events are numbered in order starting at `firstId`.
 */
export function parseSchedule(text: string, opts: { firstId?: number; year?: number } = {}): ParsedSchedule {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const warnings: string[] = [];
  if (!lines.length) return { rows: [], warnings };
  const split = (l: string) => (l.includes('\t') ? l.split('\t') : l.split(/\s{2,}/)).map((c) => c.trim());
  const header = split(lines[0]);
  const col = Object.fromEntries(
    Object.entries(COLUMNS).map(([k, re]) => [k, header.findIndex((h) => re.test(h))]),
  ) as Record<keyof typeof COLUMNS, number>;
  if (col.name < 0 || col.start < 0) {
    return { rows: [], warnings: ['The first line needs column names, including "Event" and "Start". Copy the template and fill it in.'] };
  }

  const rows: ScheduleRow[] = [];
  let nextId = opts.firstId ?? 1;
  for (const line of lines.slice(1)) {
    const c = split(line);
    const get = (k: keyof typeof COLUMNS) => (col[k] >= 0 ? (c[col[k]] ?? '').trim() : '');
    const name = get('name');
    if (!name) continue;
    const start = parseDate(get('start'), opts.year);
    if (!start) {
      warnings.push(`${name}: couldn't read the start date "${get('start')}".`);
      continue;
    }
    const year = +start.slice(0, 4);
    const endRaw = get('end');
    const end = endRaw ? parseDate(endRaw, year) : null;
    if (endRaw && !end) warnings.push(`${name}: couldn't read the end date "${endRaw}", left blank.`);
    const lockRaw = get('lock');
    const lockTime = lockRaw ? parseTime(lockRaw) : '07:00';
    if (lockRaw && !lockTime) warnings.push(`${name}: couldn't read the lock time "${lockRaw}", using 7:00 AM.`);
    const purseRaw = get('purse');
    const purse = purseRaw ? money(purseRaw) : null;
    if (purseRaw && purse === null) warnings.push(`${name}: couldn't read the purse "${purseRaw}", left blank.`);
    const idRaw = get('id');
    const id = idRaw && /^\d+$/.test(idRaw) ? +idRaw : nextId;
    nextId = id + 1;
    rows.push({
      id,
      name,
      start,
      end,
      lockAt: easternToIso(start, lockTime ?? '07:00'),
      purse,
      course: get('course') || null,
      location: get('location') || null,
      champion: get('champion') || null,
      logo: get('logo') || null,
    });
  }
  const ids = rows.map((r) => r.id);
  if (new Set(ids).size !== ids.length) warnings.push('Two events have the same number. Check the # column.');
  return { rows, warnings };
}
