/**
 * Real GitHub contribution data, fetched at build time (the site is static, so
 * it refreshes on every deploy). Falls back to a quiet empty year if the API
 * is unreachable so a build never fails on it.
 */
export type Day = { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 };

export type Contributions = {
  total: number;
  /** Columns of 7 (Sun→Sat), oldest first. Padding days are null. */
  weeks: (Day | null)[][];
  /** Contributions per week, oldest first (for the Stocks-style chart). */
  weekly: number[];
  /** Last 30 days vs the 30 before. */
  last30: number;
  prev30: number;
  streak: number;
  live: boolean;
};

const USER = 'joshgermon';

export async function getContributions(): Promise<Contributions> {
  let days: Day[] = [];
  let total = 0;
  let live = false;
  try {
    const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${USER}?y=last`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const json = (await res.json()) as { total: { lastYear: number }; contributions: Day[] };
      days = json.contributions;
      total = json.total.lastYear;
      live = true;
    }
  } catch {
    /* offline build: fall through */
  }
  if (!days.length) {
    const today = new Date();
    days = Array.from({ length: 365 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (364 - i));
      return { date: d.toISOString().slice(0, 10), count: 0, level: 0 as const };
    });
  }

  // Pad the front so the first column starts on Sunday.
  const firstDow = new Date(`${days[0].date}T00:00:00`).getDay();
  const cells: (Day | null)[] = [...Array(firstDow).fill(null), ...days];
  const weeks: (Day | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  while (weeks[weeks.length - 1].length < 7) weeks[weeks.length - 1].push(null);

  const weekly = weeks.map((w) => w.reduce((a, d) => a + (d?.count ?? 0), 0));
  const counts = days.map((d) => d.count);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const last30 = sum(counts.slice(-30));
  const prev30 = sum(counts.slice(-60, -30));
  let streak = 0;
  for (let i = counts.length - 1; i >= 0; i--) {
    if (counts[i] > 0) streak++;
    else if (i < counts.length - 1) break; // today can still be empty
  }
  return { total, weeks, weekly, last30, prev30, streak, live };
}
