import { shouldNeverHappen } from '~/lib/defects';

/**
 * Who Josh is — the facts every part of the site reads. Change copy here, not in components.
 */

/** A social profile link. */
export type Social = {
  readonly id: 'github' | 'linkedin' | 'x';
  readonly label: string;
  readonly href: string;
  readonly handle: string;
};

/** Josh's identity, contact details and what he's up to now. */
export const profile = {
  name: 'Joshua Germon',
  short: 'Josh',
  title: 'Founding Engineer',
  /** One line on what Josh does, for search results and link previews (`site/seo.ts`). */
  summary: 'Software engineer in Sydney, building products, platforms and AI tooling.',
  /** What Josh works on, as search engines read it (schema.org `knowsAbout`). */
  knowsAbout: [
    'Product engineering',
    'Platform engineering',
    'AI tooling',
    'Developer tools',
    'TypeScript',
    'Web performance',
    'Photography',
  ],
  company: 'Kodo',
  location: 'Sydney, Australia',
  timeZone: 'Australia/Sydney',
  email: 'joshgermon@gmail.com',
  socials: [
    { id: 'github', label: 'GitHub', href: 'https://github.com/joshgermon', handle: '@joshgermon' },
    {
      id: 'linkedin',
      label: 'LinkedIn',
      href: 'https://linkedin.com/in/joshgermon',
      handle: 'in/joshgermon',
    },
    { id: 'x', label: 'X', href: 'https://twitter.com/joshgermon', handle: '@joshgermon' },
  ] satisfies ReadonlyArray<Social>,
  now: {
    building: 'AI tooling and platforms at Kodo',
    learning: 'Rust and Zig, on the side',
    shooting: 'Sony A7 IV · 35mm f/1.4 GM',
  },
  githubUser: 'joshgermon',
} as const;

/** Look up a social profile by id. */
export function social(id: Social['id']): Social {
  const found = profile.socials.find((s) => s.id === id);
  // Every `Social['id']` appears in `profile.socials`, so a miss is a defect.
  return found ?? shouldNeverHappen(`Unknown social ${id}`);
}
