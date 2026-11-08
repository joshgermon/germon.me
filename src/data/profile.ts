/**
 * Single source of truth for everything the site says about Josh.
 *
 * Anything marked `TODO(josh)` is placeholder copy written to make the design
 * concepts read realistically — swap it for the real thing before shipping.
 * Projects, location and socials come from github.com/joshgermon.
 */

export const profile = {
  name: 'Joshua Germon',
  short: 'Josh',
  title: 'Founding Engineer',
  company: 'Kodo',
  location: 'Sydney, Australia',
  // TODO(josh): your own words
  tagline: 'I build the boring, load-bearing parts of software — and make them feel effortless.',
  intro:
    'Product-minded engineer owning full-stack products, platforms and infrastructure — from a blank page to production, and the on-call after.',
  email: 'joshgermon@gmail.com',
  socials: [
    { label: 'GitHub', href: 'https://github.com/joshgermon', handle: '@joshgermon' },
    { label: 'LinkedIn', href: 'https://linkedin.com/in/joshgermon', handle: 'in/joshgermon' },
    { label: 'X', href: 'https://twitter.com/joshgermon', handle: '@joshgermon' },
  ],
  now: {
    building: 'AI tooling and platforms at Kodo',
    learning: 'Rust and Zig, on the side',
    shooting: 'Sony A7 IV · 35mm f/1.4 GM',
  },
  camera: { body: 'Sony A7 IV', lens: 'FE 35mm f/1.4 GM' },
} as const;

export type Role = {
  years: string;
  start: string; // e.g. 'Aug 2025'
  end: string; // e.g. 'Present'
  title: string;
  company: string;
  formerly?: string;
  kind: string; // one-line description of the company
  summary: string;
  /** Kept empty on purpose: the site shows summaries, not CV detail. */
  highlights: string[];
  stack: string[];
};

// From Josh's CV (Nov 2026) — high-level summaries only, no CV detail on the site.
export const career: Role[] = [
  {
    years: '2025 — Now',
    start: 'Aug 2025',
    end: 'Present',
    title: 'Founding Engineer',
    company: 'Kodo',
    formerly: 'Thanks',
    kind: 'Ad-tech startup',
    summary: 'Early engineer at an ad-tech startup. Products, platforms and the AI tooling that helps a small team move fast.',
    highlights: [],
    stack: ['TypeScript', 'Cloudflare Workers', 'ClickHouse', 'MySQL'],
  },
  {
    years: '2023 — 2025',
    start: 'Jan 2023',
    end: 'Aug 2025',
    title: 'Software Engineer',
    company: 'nib',
    kind: 'Health insurance',
    summary: 'Cloud services and platform work for a large health insurer, from new microservices to legacy uplift.',
    highlights: [],
    stack: ['TypeScript', 'Go', 'AWS', 'Terraform', 'Ruby', 'C#', 'Postgres'],
  },
  {
    years: '2020 — 2023',
    start: 'Oct 2020',
    end: 'Jan 2023',
    title: 'Senior Software Developer',
    company: 'Jala Design',
    kind: 'Digital agency',
    summary: 'Led web builds for Australian brands, arts organisations and non-profits.',
    highlights: [],
    stack: ['React', 'TypeScript', 'PHP', 'MySQL', 'Python'],
  },
  {
    years: '2018 — 2020',
    start: 'Oct 2018',
    end: 'Oct 2020',
    title: 'Software Developer',
    company: 'Freelance',
    kind: 'Independent',
    summary: 'Full-stack sites and apps for small businesses: headless CMS, serverless, accessible by default.',
    highlights: [],
    stack: ['JavaScript', 'Headless CMS', 'Serverless'],
  },
];

export const volunteering = {
  title: 'Software Developer',
  org: 'Hope in a Suitcase',
  years: '2020 — 2023',
  summary: 'A donations and outreach platform for a non-profit supporting foster children.',
};

export const stats = [
  { value: '8', label: 'years shipping' },
  { value: '4', label: 'roles, startup to enterprise' },
  { value: '41', label: 'open-source repos' },
];

// From github.com/joshgermon
export const projects = [
  {
    name: 'rq',
    lang: 'Go',
    blurb: 'A streamlined CLI for testing APIs straight from OpenAPI/Swagger specs. Edit and send requests without leaving the terminal.',
    href: 'https://github.com/joshgermon/rq',
    hue: 190,
  },
  {
    name: 'bksd',
    lang: 'Rust',
    blurb: 'An automated backup daemon. Set it, forget it, sleep better.',
    href: 'https://github.com/joshgermon/bksd',
    hue: 20,
  },
  {
    name: 'cubby',
    lang: 'C',
    blurb: 'Directory backups with a hand-rolled copy engine (cubcopy) underneath.',
    href: 'https://github.com/joshgermon/cubby',
    hue: 260,
  },
  {
    name: 'tiny-http',
    lang: 'C',
    blurb: 'An HTTP/1.1 server written from scratch on unix sockets.',
    href: 'https://github.com/joshgermon/tiny-http',
    hue: 140,
  },
  {
    name: 'monkey-interpreter',
    lang: 'C++',
    blurb: 'A tree-walking interpreter for the Monkey language.',
    href: 'https://github.com/joshgermon/monkey-interpreter',
    hue: 320,
  },
  {
    name: 'retried-ts',
    lang: 'TypeScript',
    blurb: 'A minimal, type-safe async retry utility.',
    href: 'https://github.com/joshgermon/retried-ts',
    hue: 220,
  },
  {
    name: 'metro-parking-notifier',
    lang: 'TypeScript',
    blurb: 'Pings me when the station car park is filling up on office days. Peak staff-engineering.',
    href: 'https://github.com/joshgermon/metro-parking-notifier',
    hue: 45,
  },
];

// TODO(josh): replace with your own photography (angelajoshphotography.com.au).
export const photos = [
  { src: 'https://picsum.photos/id/122/1600/1067', caption: 'Harbour, blue hour', w: 1600, h: 1067 },
  { src: 'https://picsum.photos/id/65/1200/1500', caption: 'Golden hour portrait', w: 1200, h: 1500 },
  { src: 'https://picsum.photos/id/610/1600/1067', caption: 'Coast road', w: 1600, h: 1067 },
  { src: 'https://picsum.photos/id/503/1200/1500', caption: 'Steel & sky', w: 1200, h: 1500 },
  { src: 'https://picsum.photos/id/128/1600/1100', caption: 'Blue Mountains', w: 1600, h: 1100 },
  { src: 'https://picsum.photos/id/184/1600/1067', caption: 'Last light', w: 1600, h: 1067 },
  { src: 'https://picsum.photos/id/564/1200/1500', caption: 'Canyon walls', w: 1200, h: 1500 },
  { src: 'https://picsum.photos/id/110/1600/1067', caption: 'Field, sunset', w: 1600, h: 1067 },
];

export const photo = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`;
