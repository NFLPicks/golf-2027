import { SUPABASE_URL } from '../config';

/**
 * File-name slug used for images in Supabase Storage (bucket "images").
 * Matches scripts/get_images.R: "Séamus Power" -> "seamus-power", "AT&T Pebble Beach Pro-Am" -> "at-t-pebble-beach-pro-am".
 */
export function imageSlug(name: string): string {
  return name
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[ßẞ]/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const base = () => `${SUPABASE_URL}/storage/v1/object/public/images`;

/** Headshot URL for a golfer. The app shows a silhouette if the file doesn't exist. */
export const golferImageUrl = (name: string) => `${base()}/golfers/${imageSlug(name)}.png`;

/** Logo URL for a tournament: the commissioner's chosen file, else one named after the event. */
export const eventLogoUrl = (t: { name: string; logo?: string | null }) =>
  `${base()}/events/${t.logo ? encodeURIComponent(t.logo) : `${imageSlug(t.name)}.png`}`;

/** "Arnold Palmer Invitational pres. by Mastercard" -> "Arnold Palmer Invitational" (drops sponsor tails). */
export const withoutSponsor = (name: string) =>
  name.replace(/\s+(pres\.?|presented)\s+by\s+.*$/i, '').replace(/\s+(powered|hosted)\s+by\s+.*$/i, '').trim();

/**
 * Logo URLs to try, in order: the commissioner's chosen file, the full event name,
 * then the name without "pres. by ..." (so "the-memorial-tournament.png" matches "the Memorial Tournament pres. by Workday").
 */
export function eventLogoUrls(t: { name: string; logo?: string | null }): string[] {
  const urls = t.logo ? [`${base()}/events/${encodeURIComponent(t.logo)}`] : [];
  for (const n of [t.name, withoutSponsor(t.name)]) urls.push(`${base()}/events/${imageSlug(n)}.png`);
  return [...new Set(urls)];
}
