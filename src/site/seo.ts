/**
 * How pages describe themselves to search engines and link previews: the kind of page, the
 * share card, and schema.org structured data. Content only; `layouts/BaseLayout` renders it.
 */
import { casesHandled } from '~/lib/defects';
import { profile } from '~/site/profile';

/** What a page is. */
export type PageKind =
  /** The home page: Josh's profile. */
  | { readonly _tag: 'Profile' }
  /** A note. */
  | {
      readonly _tag: 'Article';
      readonly headline: string;
      readonly published: Date;
    }
  /** Anything else. */
  | { readonly _tag: 'Page' };

/** The share card (`public/og.jpg` and `public/og.mp4`, made by `pnpm og`). */
export const shareCard = {
  image: '/og.jpg',
  video: '/og.mp4',
  width: 1200,
  height: 630,
  alt: `${profile.short} Germon: ${profile.summary}`,
} as const;

/** The site's X handle for link cards, e.g. `@joshgermon`. */
export const xHandle: string = profile.socials.find((s) => s.id === 'x')?.handle ?? '';

/** The Open Graph type for a kind of page. */
export function openGraphType(kind: PageKind): 'profile' | 'article' | 'website' {
  switch (kind._tag) {
    case 'Profile':
      return 'profile';
    case 'Article':
      return 'article';
    case 'Page':
      return 'website';
    default:
      return casesHandled(kind);
  }
}

/**
 * schema.org JSON-LD for a page: Josh as a `Person` on every page, wrapped in a `ProfilePage`
 * at home or referenced as the author of a `BlogPosting`.
 *
 * @param kind - What the page is.
 * @param url - The page's canonical URL.
 * @param site - The site's origin.
 * @returns A JSON-serialisable graph, or `undefined` for pages that don't need one.
 */
export function structuredData(kind: PageKind, url: URL, site: URL): object | undefined {
  const personId = new URL('/#person', site).href;
  const person = {
    '@type': 'Person',
    '@id': personId,
    name: profile.name,
    alternateName: `${profile.short} Germon`,
    jobTitle: profile.title,
    description: profile.summary,
    knowsAbout: profile.knowsAbout,
    address: { '@type': 'PostalAddress', addressLocality: 'Sydney', addressCountry: 'AU' },
    url: site.href,
    image: new URL(shareCard.image, site).href,
    sameAs: profile.socials.map((s) => s.href),
  };
  switch (kind._tag) {
    case 'Profile':
      return {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': new URL('/#website', site).href,
            url: site.href,
            name: profile.name,
          },
          { '@type': 'ProfilePage', url: url.href, mainEntity: person },
        ],
      };
    case 'Article':
      return {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: kind.headline,
        datePublished: kind.published.toISOString().slice(0, 10),
        url: url.href,
        mainEntityOfPage: url.href,
        author: person,
        image: new URL(shareCard.image, site).href,
      };
    case 'Page':
      return undefined;
    default:
      return casesHandled(kind);
  }
}
