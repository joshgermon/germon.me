/**
 * The FAA's live airport status feed (NAS Status, `nasstatus.faa.gov/api/airport-status-
 * information`, public domain XML): ground stops, ground delay programs, departure and arrival
 * delays, and closures, right now. The XML stays in this file; Workers have no DOMParser, so the
 * few flat elements are read with patterns, and anything unexpected is skipped.
 */
import type { FaaStatus } from '~/experiments/ground-stop/domain/live';

const URL = 'https://nasstatus.faa.gov/api/airport-status-information';

const blocks = (xml: string, tag: string): string[] =>
  [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1] ?? '');
const field = (xml: string, tag: string): string =>
  (new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml)?.[1] ?? '').trim();
const decodeEntities = (s: string): string =>
  s.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');

/** Parse the feed into statuses (exported for tests). */
export const parseNasStatus = (
  xml: string,
): { readonly updated: string; readonly statuses: FaaStatus[] } => {
  const statuses: FaaStatus[] = [];
  for (const b of blocks(xml, 'Ground_Stop')) {
    statuses.push({
      airport: field(b, 'ARPT'),
      kind: 'GroundStop',
      reason: decodeEntities(field(b, 'Reason')),
      detail: field(b, 'End_Time') ? `until ${field(b, 'End_Time')}` : '',
    });
  }
  for (const b of blocks(xml, 'Ground_Delay')) {
    statuses.push({
      airport: field(b, 'ARPT'),
      kind: 'GroundDelay',
      reason: decodeEntities(field(b, 'Reason')),
      detail: `avg ${field(b, 'Avg')}, max ${field(b, 'Max')}`,
    });
  }
  for (const b of blocks(xml, 'Delay')) {
    const ad = blocks(b, 'Arrival_Departure')[0] ?? '';
    statuses.push({
      airport: field(b, 'ARPT'),
      kind: 'Delay',
      reason: decodeEntities(field(b, 'Reason')),
      detail: `${field(ad, 'Min')}–${field(ad, 'Max')} ${field(ad, 'Trend').toLowerCase()}`.trim(),
    });
  }
  for (const b of blocks(xml, 'Airport')) {
    const reason = decodeEntities(field(b, 'Reason'));
    // Standing notices (closed to unscheduled private flights) aren't news; capacity closures are.
    if (/NON SKED TRANSIENT GA/.test(reason)) continue;
    const what = /DIVERSION/.test(reason)
      ? 'closed to diversions' + (/CAPACITY/.test(reason) ? ' (capacity)' : '')
      : 'closed';
    statuses.push({
      airport: field(b, 'ARPT'),
      kind: 'Closure',
      reason: what,
      detail: field(b, 'Reopen') ? `reopens ${field(b, 'Reopen').replace(/\.$/, '')}` : '',
    });
  }
  return { updated: field(xml, 'Update_Time'), statuses: statuses.filter((s) => s.airport) };
};

/** Fetch and parse the feed; null when it can't be read. */
export const fetchNasStatus = async (
  fetcher: typeof fetch,
): Promise<{ readonly updated: string; readonly statuses: FaaStatus[] } | null> => {
  try {
    const res = await fetcher(URL, {
      headers: { 'User-Agent': 'germon.me experiments (ground-stop)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return parseNasStatus(await res.text());
  } catch {
    return null;
  }
};
