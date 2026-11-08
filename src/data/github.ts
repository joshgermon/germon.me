/**
 * Live projects from GitHub, fetched at build time (the site is static, so the
 * list refreshes on every deploy — schedule a daily rebuild to keep it fresh).
 *
 * Rules: Josh's own public repos, not forks/archived, with a description, most
 * recently pushed first. Descriptions come from GitHub; anything missing falls
 * back to the hand-written blurbs in profile.ts. If GitHub is unreachable the
 * build still works with the static list.
 */
import { projects as fallback } from './profile';

export type Repo = {
  name: string;
  lang: string;
  blurb: string;
  href: string;
  hue: number;
  stars: number;
  pushedAt: string; // ISO
  /** e.g. "3 weeks ago" — computed at build time. */
  updated: string;
};

const USER = 'joshgermon';
const HIDE = new Set(['germon.me', 'nvim-config', 'dev-env', 'ziglings']);
const HUE: Record<string, number> = { Go: 190, Rust: 20, C: 260, 'C++': 320, TypeScript: 220, Zig: 40, Svelte: 15, Lua: 240, Python: 200 };

const ago = (iso: string) => {
  const days = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86_400_000));
  if (days < 1) return 'today';
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const y = Math.round(days / 365);
  return `${y} year${y === 1 ? '' : 's'} ago`;
};

let cache: Promise<Repo[]> | null = null;

export function getRepos(limit = 7): Promise<Repo[]> {
  cache ??= load();
  return cache.then((r) => r.slice(0, limit));
}

async function load(): Promise<Repo[]> {
  const blurbs = new Map(fallback.map((p) => [p.name, p.blurb]));
  try {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'germon.me-build' };
    const token = import.meta.env.GITHUB_TOKEN as string | undefined;
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`https://api.github.com/users/${USER}/repos?sort=pushed&per_page=100&type=owner`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(String(res.status));
    type GH = { name: string; fork: boolean; archived: boolean; description: string | null; language: string | null; html_url: string; stargazers_count: number; pushed_at: string };
    const repos = ((await res.json()) as GH[])
      .filter((r) => !r.fork && !r.archived && !HIDE.has(r.name))
      .map((r) => ({
        name: r.name,
        lang: r.language ?? 'Other',
        blurb: blurbs.get(r.name) ?? r.description ?? '',
        href: r.html_url,
        hue: HUE[r.language ?? ''] ?? 210,
        stars: r.stargazers_count,
        pushedAt: r.pushed_at,
        updated: ago(r.pushed_at),
      }))
      .filter((r) => r.blurb && !/^advent-of-code/.test(r.name));
    if (repos.length) return repos;
  } catch {
    /* offline or rate-limited: fall through */
  }
  return fallback.map((p) => ({ ...p, stars: 0, pushedAt: '', updated: '' }));
}
