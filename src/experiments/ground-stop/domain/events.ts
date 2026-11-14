/**
 * What happened, when, and who said so. The timeline's ticks, the story's anchors and the
 * reported figures the HUD reveals as the clock passes them. Every entry names its source.
 */
import { LIFT, STOP, at, type Minute } from './clock';

/** A citable source. */
export interface Source {
  readonly id: SourceId;
  readonly name: string;
  readonly url: string;
}

/** The sources the app cites. */
export type SourceId =
  | 'opensky'
  | 'adsblol'
  | 'adsbfi'
  | 'nas'
  | 'atcscc'
  | 'cbs'
  | 'abc'
  | 'aerocorner';

/** Every source, by id. */
export const SOURCES: Readonly<Record<SourceId, Source>> = {
  adsblol: {
    id: 'adsblol',
    name: 'adsb.lol (ODbL)',
    url: 'https://www.adsb.lol/docs/open-data/historical/',
  },
  opensky: { id: 'opensky', name: 'The OpenSky Network', url: 'https://opensky-network.org/' },
  adsbfi: { id: 'adsbfi', name: 'adsb.fi', url: 'https://adsb.fi/' },
  nas: { id: 'nas', name: 'FAA NAS Status', url: 'https://nasstatus.faa.gov/' },
  atcscc: {
    id: 'atcscc',
    name: 'FAA ATCSCC advisories',
    url: 'https://www.fly.faa.gov/adv/adv_list?whichAdvisories=ATCSCC&advisoryCategory=NotAll&date=2026-11-13&gStop=true&_gStop=on',
  },
  cbs: {
    id: 'cbs',
    name: 'CBS News',
    url: 'https://www.cbsnews.com/news/faa-issues-nationwide-ground-stop/',
  },
  abc: {
    id: 'abc',
    name: 'ABC News',
    url: 'https://abcnews.com/US/nationwide-ground-stop-ordered-airports-faa/story?id=138121848',
  },
  aerocorner: {
    id: 'aerocorner',
    name: 'AeroCorner',
    url: 'https://aerocorner.com/blog/faa-nationwide-ground-stop/',
  },
};

/** How much an event matters on the timeline. */
export type Weight = 'major' | 'minor';

/** A moment on the timeline. */
export interface Event {
  readonly at: Minute;
  readonly label: string;
  readonly detail: string;
  readonly source: SourceId;
  readonly weight: Weight;
  /** Airports the event happened at, by IATA code, for a ping on the globe. */
  readonly airports?: readonly string[];
}

/** Local ground stops the Command Center issued at hubs after the reopening (14 Nov list, ET). */
export const RECOVERY_STOPS: readonly { readonly at: Minute; readonly airport: string }[] = [
  { at: at(20, 41), airport: 'ORD' },
  { at: at(21, 1), airport: 'SEA' },
  { at: at(21, 4), airport: 'SAN' },
  { at: at(21, 9), airport: 'EWR' },
  { at: at(21, 19), airport: 'MSP' },
  { at: at(21, 38), airport: 'ORD' },
  { at: at(21, 42), airport: 'LAX' },
  { at: at(21, 51), airport: 'SAN' },
  { at: at(21, 56), airport: 'SEA' },
  { at: at(21, 59), airport: 'MSP' },
  { at: at(22, 8), airport: 'ORD' },
  { at: at(22, 29), airport: 'SAN' },
  { at: at(22, 41), airport: 'DFW' },
  { at: at(22, 46), airport: 'LAX' },
  { at: at(23, 17), airport: 'ORD' },
];

/** The day, in order. */
export const EVENTS: readonly Event[] = [
  {
    at: at(15, 28),
    label: 'Chicago ground stop',
    detail: 'Ground stops at O’Hare (3:28) and Midway (3:31) for an equipment outage.',
    source: 'atcscc',
    weight: 'minor',
    airports: ['ORD', 'MDW'],
  },
  {
    at: STOP,
    label: 'National ground stop',
    detail: 'Advisory 111: all airports ground stopped until further notice.',
    source: 'atcscc',
    weight: 'major',
  },
  {
    at: at(17, 21),
    label: 'Boston–Frankfurt departs',
    detail: 'A Lufthansa flight leaves Boston mid-stop, per Flightradar24 data cited by CNBC.',
    source: 'aerocorner',
    weight: 'minor',
    airports: ['BOS'],
  },
  {
    at: at(17, 46),
    label: 'Reason: communications failure',
    detail: 'Advisory 120 gives the reason. Flights may depart as en-route centers recover.',
    source: 'atcscc',
    weight: 'minor',
  },
  {
    at: at(18, 20),
    label: '10,000+ delays',
    detail: 'FlightAware counts over 10,000 delays and 2,000 cancellations.',
    source: 'abc',
    weight: 'minor',
  },
  {
    at: at(18, 50),
    label: 'Pacific departures',
    detail: 'Cargo and passenger flights depart the West Coast for Asia and Hawaii.',
    source: 'aerocorner',
    weight: 'minor',
    airports: ['LAX', 'SFO', 'SEA'],
  },
  {
    at: LIFT,
    label: 'Ground stop cancelled',
    detail: 'Advisory 005 cancels the ground stop at 8:16 p.m.',
    source: 'atcscc',
    weight: 'major',
  },
  {
    at: at(20, 41),
    label: 'Local ground stops',
    detail:
      '15 local ground stops at O’Hare, LAX, Seattle, San Diego, MSP, DFW and Newark by 11:17 p.m.',
    source: 'atcscc',
    weight: 'minor',
  },
];

/** A figure someone reported, revealed on the HUD once the clock passes it. */
export interface Reported {
  readonly at: Minute;
  readonly value: string;
  readonly label: string;
  readonly source: SourceId;
  readonly via?: string;
}

/** The headline numbers, as reported. */
export const REPORTED: readonly Reported[] = [
  { at: at(18, 20), value: '10,000+', label: 'delays', source: 'abc', via: 'FlightAware' },
  {
    at: at(18, 20),
    value: '2,000+',
    label: 'cancellations by 6:20 p.m.',
    source: 'abc',
    via: 'FlightAware',
  },
  {
    at: at(22, 24),
    value: '4,000+',
    label: 'cancellations by Friday night',
    source: 'cbs',
    via: 'FlightAware',
  },
];
