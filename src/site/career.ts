/**
 * Career as Wallet passes. High-level summaries only — the site never shows CV detail.
 * Each role carries its employer's real branding (colours and logo from their sites).
 */
import jalaLogo from '~/assets/brands/jala-logo-alt.svg';
import kodoMark from '~/assets/brands/kodo-mark.svg';
import kodoWordmark from '~/assets/brands/kodo-wordmark.svg';
import nibLogo from '~/assets/brands/nib-logo.svg';
import memoji from '~/assets/memoji.jpg';

/** How a pass is painted. */
export type Brand = {
  /** Pass background. */
  readonly bg: string;
  /** Pass foreground. */
  readonly fg: string;
  /** Field-label colour. */
  readonly label: string;
  /** The employer's mark, as an image URL plus its rendered height in px. */
  readonly logo:
    | {
        readonly _tag: 'logo';
        readonly src: string;
        /** Rendered size in px; the width keeps the artwork's aspect so the image reserves its box. */
        readonly width: number;
        readonly height: number;
      }
    | { readonly _tag: 'avatar'; readonly src: string };
  /** Small square mark for list rows. */
  readonly mark: string;
  readonly site: string;
};

/** When a role ran. `Present` marks the current role. */
export type Tenure =
  | { readonly _tag: 'Current'; readonly start: string }
  | { readonly _tag: 'Past'; readonly start: string; readonly end: string };

/** One role, shown as one pass. */
export type Role = {
  readonly id: 'kodo' | 'nib' | 'jala' | 'freelance';
  readonly title: string;
  readonly company: string;
  readonly formerly?: string;
  /** One line about the company. */
  readonly kind: string;
  readonly summary: string;
  readonly tenure: Tenure;
  readonly stack: ReadonlyArray<string>;
  readonly brand: Brand;
};

/** A logo's rendered box at `height` px tall, keeping the artwork's aspect ratio. */
const sized = (img: { width: number; height: number }, height: number) => ({
  width: Math.round((img.width / img.height) * height),
  height,
});

/** Every role, newest first. The first is the current role. */
export const career: ReadonlyArray<Role> = [
  {
    id: 'kodo',
    title: 'Founding Engineer',
    company: 'Kodo',
    formerly: 'Thanks',
    kind: 'Ad-tech startup',
    summary:
      'Early engineer at an ad-tech startup. Products, platforms and the AI tooling that helps a small team move fast.',
    tenure: { _tag: 'Current', start: 'Aug 2025' },
    stack: ['TypeScript', 'Cloudflare Workers', 'ClickHouse', 'MySQL'],
    brand: {
      bg: '#ffa7e0',
      fg: '#171138',
      label: 'rgb(23 17 56 / 0.62)',
      logo: { _tag: 'logo', src: kodoWordmark.src, ...sized(kodoWordmark, 18) },
      mark: kodoMark.src,
      site: 'kodo.co',
    },
  },
  {
    id: 'nib',
    title: 'Software Engineer',
    company: 'nib',
    kind: 'Health insurance',
    summary:
      'Cloud services and platform work for a large health insurer, from new microservices to legacy uplift.',
    tenure: { _tag: 'Past', start: 'Jan 2023', end: 'Aug 2025' },
    stack: ['TypeScript', 'Go', 'AWS', 'Terraform', 'Ruby', 'C#', 'Postgres'],
    brand: {
      bg: '#154734',
      fg: '#ffffff',
      label: '#82e578',
      logo: { _tag: 'logo', src: nibLogo.src, ...sized(nibLogo, 17) },
      mark: nibLogo.src,
      site: 'nib.com.au',
    },
  },
  {
    id: 'jala',
    title: 'Senior Software Developer',
    company: 'Jala Design',
    kind: 'Digital agency',
    summary: 'Led web builds for Australian brands, arts organisations and non-profits.',
    tenure: { _tag: 'Past', start: 'Oct 2020', end: 'Jan 2023' },
    stack: ['React', 'TypeScript', 'PHP', 'MySQL', 'Python'],
    brand: {
      bg: '#201e1c',
      fg: '#ffffff',
      label: 'rgb(255 255 255 / 0.55)',
      logo: { _tag: 'logo', src: jalaLogo.src, ...sized(jalaLogo, 20) },
      mark: jalaLogo.src,
      site: 'jaladesign.com.au',
    },
  },
  {
    id: 'freelance',
    title: 'Software Developer',
    company: 'Freelance',
    kind: 'Independent',
    summary:
      'Full-stack sites and apps for small businesses: headless CMS, serverless, accessible by default.',
    tenure: { _tag: 'Past', start: 'Oct 2018', end: 'Oct 2020' },
    stack: ['JavaScript', 'Headless CMS', 'Serverless'],
    brand: {
      bg: '#f4f2ee',
      fg: '#1c1c1e',
      label: 'rgb(60 60 67 / 0.6)',
      logo: { _tag: 'avatar', src: memoji.src },
      mark: memoji.src,
      site: 'germon.me',
    },
  },
];

/** The volunteer role, shown in the career view only. */
export const volunteering = {
  title: 'Software Developer',
  org: 'Hope in a Suitcase',
  years: '2020 – 2023',
  summary: 'A donations and outreach platform for a non-profit supporting foster children.',
} as const;

/** The year part of "Aug 2025". */
export const yearOf = (monthYear: string): string => monthYear.split(' ')[1] ?? monthYear;

/** "2025–Now" / "2023–2025". */
export function tenureYears(tenure: Tenure): string {
  return tenure._tag === 'Current'
    ? `${yearOf(tenure.start)}–Now`
    : `${yearOf(tenure.start)}–${yearOf(tenure.end)}`;
}
