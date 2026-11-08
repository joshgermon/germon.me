/**
 * "Grab a coffee": the next two working weeks in Sydney, as a tiny calendar.
 * Weekday mornings are open; pick one and the button drafts the email.
 * Rendered at build time and again on the client (so the dates are never stale).
 */
const TZ = 'Australia/Sydney';

export type CoffeeDay = { iso: string; d: number; short: string; long: string; state: 'past' | 'today' | 'open' };

const isoIn = (now: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export function fortnight(now = new Date()) {
  const today = isoIn(now);
  const t = new Date(`${today}T12:00:00Z`);
  const dow = t.getUTCDay();
  // This week's Monday — or next Monday at the weekend.
  const start = new Date(t);
  start.setUTCDate(t.getUTCDate() + (dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow));
  const days: CoffeeDay[] = [];
  for (let w = 0; w < 2; w++)
    for (let i = 0; i < 5; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + w * 7 + i);
      const iso = d.toISOString().slice(0, 10);
      days.push({
        iso,
        d: d.getUTCDate(),
        short: d.toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).replace(',', ''),
        long: d.toLocaleDateString('en-AU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).replace(',', ''),
        state: iso < today ? 'past' : iso === today ? 'today' : 'open',
      });
    }
  const m = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-AU', { timeZone: 'UTC', month: 'long' });
  const a = m(days[0].iso);
  const b = m(days[days.length - 1].iso);
  return { month: a === b ? a : `${a.slice(0, 3)} – ${b.slice(0, 3)}`, days, first: days.find((d) => d.state === 'open') ?? days[days.length - 1] };
}

export const coffeeHref = (email: string, day: CoffeeDay) =>
  `mailto:${email}?subject=${encodeURIComponent(`Coffee? ${day.short}`)}&body=${encodeURIComponent(`Hi Josh,\n\nFree for a coffee on the morning of ${day.long}?\n\n`)}`;

export function coffeeGrid(days: CoffeeDay[], picked: string) {
  return days
    .map(
      (d) =>
        `<button type="button" class="cf-d" data-cf-day="${d.iso}" data-state="${d.state}"${d.state === 'open' ? '' : ' disabled'} aria-pressed="${d.iso === picked}" aria-label="${d.long}${d.state === 'open' ? ', morning free' : d.state === 'today' ? ', today' : ''}">${d.d}</button>`,
    )
    .join('');
}
