/** Employer branding for the Wallet passes — colours and logos taken from each company's site. */
export type Brand = {
  key: string;
  bg: string;
  fg: string;
  label: string;
  logo?: string;
  logoH: number;
  /** Small square mark for list rows / pass thumbnails. */
  mark?: string;
  avatar?: string;
  site: string;
};

export const brands: Record<string, Brand> = {
  Kodo: {
    key: 'kodo',
    bg: '#ffa7e0',
    fg: '#171138',
    label: 'rgb(23 17 56 / 0.62)',
    logo: '/brands/kodo-wordmark.svg',
    logoH: 22,
    mark: '/brands/kodo-mark.svg',
    site: 'kodo.co',
  },
  nib: { key: 'nib', bg: '#154734', fg: '#ffffff', label: '#82e578', logo: '/brands/nib-logo.svg', logoH: 21, site: 'nib.com.au' },
  'Jala Design': {
    key: 'jala',
    bg: '#201e1c',
    fg: '#ffffff',
    label: 'rgb(255 255 255 / 0.55)',
    logo: '/brands/jala-logo-alt.svg',
    logoH: 24,
    site: 'jaladesign.com.au',
  },
  Freelance: { key: 'free', bg: '#f4f2ee', fg: '#1c1c1e', label: 'rgb(60 60 67 / 0.6)', avatar: '/me/memoji.jpg', logoH: 24, site: 'germon.me' },
};

export const brandOf = (company: string) => brands[company] ?? brands.Freelance;
