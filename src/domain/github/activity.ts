/**
 * Josh's GitHub activity as of an instant: the showcased repos and the contribution calendar.
 * Either part can be missing (GitHub may serve one and not the other), so the aggregate says
 * exactly which parts it holds; at least one always is.
 */
import type { Contributions } from './contributions';
import type { Repo } from './repo';

/** What is known about Josh's GitHub activity. */
export type Activity =
  | {
      readonly _tag: 'Complete';
      readonly asOf: Date;
      readonly repos: ReadonlyArray<Repo>;
      readonly contributions: Contributions;
    }
  | { readonly _tag: 'ReposOnly'; readonly asOf: Date; readonly repos: ReadonlyArray<Repo> }
  | {
      readonly _tag: 'ContributionsOnly';
      readonly asOf: Date;
      readonly contributions: Contributions;
    };

/** The parts an `Activity` is assembled from; either may be absent. */
export type Parts = {
  readonly repos: ReadonlyArray<Repo> | undefined;
  readonly contributions: Contributions | undefined;
};

/**
 * Assemble whatever is known into an `Activity`.
 *
 * @param asOf - When the parts were fetched.
 * @param parts - The repos and/or calendar.
 * @returns The activity, or `undefined` when neither part is known.
 */
export function fromParts(asOf: Date, parts: Parts): Activity | undefined {
  const { repos: shown, contributions: calendar } = parts;
  if (shown && calendar) return { _tag: 'Complete', asOf, repos: shown, contributions: calendar };
  if (shown) return { _tag: 'ReposOnly', asOf, repos: shown };
  if (calendar) return { _tag: 'ContributionsOnly', asOf, contributions: calendar };
  return undefined;
}

/**
 * The showcased repos, if known.
 *
 * @param activity - The activity.
 * @returns The repos, or `undefined` when GitHub didn't serve them.
 */
export function repos(activity: Activity): ReadonlyArray<Repo> | undefined {
  return activity._tag === 'ContributionsOnly' ? undefined : activity.repos;
}

/**
 * The contribution calendar, if known.
 *
 * @param activity - The activity.
 * @returns The calendar, or `undefined` when GitHub didn't serve it.
 */
export function contributions(activity: Activity): Contributions | undefined {
  return activity._tag === 'ReposOnly' ? undefined : activity.contributions;
}
