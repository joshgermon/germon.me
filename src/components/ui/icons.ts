/**
 * The one icon set: SF-Symbols-flavoured line icons on a 24px grid. Rendered by `Icon.astro`
 * (static) and `Icon.svelte` (inside islands) from the same path data so they never drift.
 * Filled glyphs carry their own `fill`.
 */
export const iconPaths = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowUpRight: '<path d="M7 17 17 7M8 7h9v9"/>',
  book: '<path d="M4 5.5C6.5 4 9.5 4 12 5.8 14.5 4 17.5 4 20 5.5V19c-2.5-1.4-5.5-1.4-8 .4-2.5-1.8-5.5-1.8-8-.4z"/><path d="M12 5.8v13.6"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  camera:
    '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.6-2.2h5.8L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.6"/>',
  chart: '<path d="M4 19.5h16"/><path d="m4.5 15.5 4.5-4.5 3.5 3 7-7.5"/><path d="M15.5 6.5h4v4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  code: '<path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>',
  coffee:
    '<path d="M4.5 9h12v5.5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z"/><path d="M16.5 10.5h1.2a2.6 2.6 0 0 1 0 5.2h-1.6M8 3.5c-.6.9-.6 1.8 0 2.7M11.5 3.5c-.6.9-.6 1.8 0 2.7"/>',
  command:
    '<path d="M9 9h6v6H9z"/><path d="M9 9V7.5A2.5 2.5 0 1 0 6.5 10H9M15 9V7.5a2.5 2.5 0 1 1 2.5 2.5H15M9 15v1.5A2.5 2.5 0 1 1 6.5 14H9M15 15v1.5a2.5 2.5 0 1 0 2.5-2.5H15"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  folder:
    '<path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2l2 2H19A1.5 1.5 0 0 1 20.5 9v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z"/>',
  github:
    '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  hammer:
    '<path d="M14.5 4.5 19.5 9.5 17.5 11.5 15.5 9.5 6 19a1.6 1.6 0 0 1-2.3-2.3L13.2 7.2 11.5 5.5c1.6-1.4 2.2-1.6 3-1z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  linkedin:
    '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M8 10.5V16M8 7.6v.1M11.5 16v-5.5M11.5 13c0-1.6 1-2.6 2.3-2.6s2.2.9 2.2 2.6V16"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  note: '<path d="M6 3.5h9l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1-1.5z"/><path d="M14.5 3.5V8h4.5M8.5 12.5h7M8.5 16h5"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>',
  return: '<path d="M19 5v6.5a2.5 2.5 0 0 1-2.5 2.5H6"/><path d="m9.5 10-4 4 4 4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  sparkles:
    '<path d="M10 3.5 11.6 8 16 9.6 11.6 11.2 10 15.7 8.4 11.2 4 9.6 8.4 8zM17.5 14l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  sunMax:
    '<circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  terminal:
    '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m7 9.5 3 2.5-3 2.5M12.5 15h4.5"/>',
  wallet:
    '<rect x="3.5" y="6" width="17" height="13" rx="2.5"/><path d="M3.5 10h17M15.5 14.5h2"/><path d="M6 6 15 3.5a1.5 1.5 0 0 1 1.9 1.1L17.3 6"/>',
  x: '<path d="M4.2 4h4.6l3.9 5.4L17.4 4h2.1l-5.8 6.6L20 20h-4.6l-4.2-5.9L6 20H3.9l6.3-7.1z" fill="currentColor" stroke="none"/>',
} as const;

/** Every icon the site can render. */
export type IconName = keyof typeof iconPaths;
