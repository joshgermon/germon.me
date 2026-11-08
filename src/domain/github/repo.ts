/**
 * Josh's showcased repositories: which of his GitHub repos the site lists, in what order,
 * and how their recency is said ("3w", "3 weeks ago").
 *
 * GitHub's list comes in as `Listing`s; `showcase` applies the rules and returns `Repo`s,
 * which can only be built that way.
 */
declare const brand: unique symbol;

/** A repository as GitHub lists it — before the site decides whether to show it. */
export type Listing = {
  readonly name: string;
  /** Login of the owning account. */
  readonly owner: string;
  readonly fork: boolean;
  readonly archived: boolean;
  /** GitHub's description; repos without one are usually not worth showing. */
  readonly description: string | null;
  /** GitHub's primary language, when it detected one. */
  readonly language: string | null;
  readonly url: string;
  readonly stars: number;
  readonly pushedAt: Date;
};

/** A repository the site shows. Opaque: only `showcase` makes these. */
export type Repo = {
  readonly name: string;
  /** Primary language, or `Other`. */
  readonly language: string;
  /** One or two sentences about it; never empty. */
  readonly blurb: string;
  readonly url: string;
  readonly stars: number;
  readonly pushedAt: Date;
  readonly [brand]: 'Repo';
};

/** The rules for which repos make the list. */
export type ShowcasePolicy = {
  /** Only this account's own repos. */
  readonly owner: string;
  /** Repos never shown, by exact name. */
  readonly hidden: ReadonlySet<string>;
  /** Repos never shown, by name prefix (e.g. `advent-of-code`). */
  readonly hiddenPrefixes: ReadonlyArray<string>;
  /** Hand-written blurbs that replace GitHub's description, by repo name. */
  readonly blurbs: ReadonlyMap<string, string>;
  /** At most this many repos. */
  readonly limit: number;
};

/**
 * Choose the repos to show: the owner's own, not forks, not archived, not hidden, with a
 * blurb (hand-written or GitHub's), most recently pushed first.
 *
 * @param listings - Everything GitHub listed.
 * @param policy - The selection rules.
 * @returns At most `policy.limit` repos, newest push first.
 */
export function showcase(
  listings: ReadonlyArray<Listing>,
  policy: ShowcasePolicy,
): ReadonlyArray<Repo> {
  return listings
    .filter(
      (l) =>
        l.owner.toLowerCase() === policy.owner.toLowerCase() &&
        !l.fork &&
        !l.archived &&
        !policy.hidden.has(l.name) &&
        !policy.hiddenPrefixes.some((p) => l.name.startsWith(p)),
    )
    .flatMap((l): Repo[] => {
      const blurb = (policy.blurbs.get(l.name) ?? l.description ?? '').trim();
      if (!blurb) return [];
      // SAFETY: TypeScript cannot express the brand; this is the only place a Repo is made,
      // and the filter above has applied every showcase rule.
      const repo = {
        name: l.name,
        language: l.language ?? 'Other',
        blurb,
        url: l.url,
        stars: Math.max(0, Math.trunc(l.stars)),
        pushedAt: l.pushedAt,
      } as Repo;
      return [repo];
    })
    .toSorted((a, b) => b.pushedAt.getTime() - a.pushedAt.getTime())
    .slice(0, Math.max(0, policy.limit));
}

/**
 * The blurb's first clause, for one-line rows: "An automated backup daemon".
 *
 * @param repo - The repo.
 * @returns Its blurb up to the first sentence break or em dash, without a trailing full stop.
 */
export function tagline(repo: Repo): string {
  const [first = repo.blurb] = repo.blurb.split(/\. | — /);
  return first.replace(/\.$/, '');
}

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

const ageInDays = (pushedAt: Date, now: Date): number =>
  Math.max(0, Math.round((now.getTime() - pushedAt.getTime()) / 86_400_000));

/**
 * Recency said quietly, for dense rows: `today`, `5d`, `3w`, `7mo`, `2y`.
 *
 * @param pushedAt - When the repo was last pushed.
 * @param now - The current instant.
 * @returns A compact age.
 */
export function recencyShort(pushedAt: Date, now: Date): string {
  const d = ageInDays(pushedAt, now);
  if (d < 1) return 'today';
  if (d < 14) return `${d}d`;
  if (d < 60) return `${Math.round(d / 7)}w`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${Math.round(d / 365)}y`;
}

/**
 * Recency in words: `today`, `1 day ago`, `3 weeks ago`, `2 years ago`.
 *
 * @param pushedAt - When the repo was last pushed.
 * @param now - The current instant.
 * @returns A spoken age.
 */
export function recencyLong(pushedAt: Date, now: Date): string {
  const d = ageInDays(pushedAt, now);
  if (d < 1) return 'today';
  if (d < 14) return plural(d, 'day');
  if (d < 60) return plural(Math.round(d / 7), 'week');
  if (d < 365) return plural(Math.round(d / 30), 'month');
  return plural(Math.round(d / 365), 'year');
}
