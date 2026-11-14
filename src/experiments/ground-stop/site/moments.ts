/**
 * The moments you can jump between, and the sentence whose pills point at them. Copy lives here,
 * never in components. Figures come from the observed day through `DayStats` (computed at build
 * time); reported figures and quotes name who reported them.
 */
import {
  LIFT,
  STOP,
  at,
  formatClockShort,
  type Minute,
} from '~/experiments/ground-stop/domain/clock';
import type { DayStats } from '~/experiments/ground-stop/domain/day-stats';
import type { View } from '~/experiments/ground-stop/engine/globe';

/** A moment: a clock time, a camera, and a few words on what happened. */
export interface Moment {
  readonly id: string;
  readonly time: Minute;
  readonly view: View;
  /** Short label for chips, ticks and the palette. */
  readonly label: string;
  readonly title: string;
  /** Trusted HTML (<strong>, <q> only). */
  readonly body: string;
  readonly tone: 'neutral' | 'held' | 'released';
}

/** A run of the sentence: plain text, or a pill that jumps to a moment. */
export type Segment =
  | { readonly _tag: 'Text'; readonly text: string }
  | { readonly _tag: 'Pill'; readonly label: string; readonly moment: string };

const n = (x: number): string => Math.round(x).toLocaleString('en-US');
const time = (m: Minute): string =>
  formatClockShort(m).replace(' PM', ' p.m.').replace(' AM', ' a.m.');
const US: View = { lat: 38, lon: -97, distance: 3.55 };

/** Every moment, in time order. */
export const moments = (s: DayStats): readonly Moment[] => {
  const normal = s.airborne(at(15));
  const cliff = at(15, 40);
  const drain = s.airborne(at(18));
  const lowWeek = s.airborne(s.low.at);
  const surgeWeek = s.departures15(s.surge.at);
  const latest = s.airborne(s.window.end);
  const worst = s.behind.worst[0];
  const all: Moment[] = [
    {
      id: 'normal',
      time: at(15),
      view: US,
      label: 'Normal traffic',
      title: 'Normal traffic',
      tone: 'neutral',
      body: `<strong>${n(normal.now)}</strong> airline flights over the US, compared with ${n(normal.lastWeek)} at the same time the previous Friday.`,
    },
    {
      id: 'chicago',
      time: at(15, 31),
      view: { lat: 41.6, lon: -88, distance: 1.9 },
      label: 'Chicago',
      title: 'Chicago ground stop',
      tone: 'held',
      body: 'The FAA stopped departures at O’Hare at 3:28 p.m. and at Midway at 3:31 p.m. because of an equipment outage.',
    },
    {
      id: 'cliff',
      time: cliff + 4,
      view: { lat: 37, lon: -92, distance: 3.2 },
      label: 'Departures stop',
      title: 'Departures stop',
      tone: 'held',
      body: 'At 3:40 p.m. departures from US airports fell from about 30 a minute to 2. The national ground stop was issued 14 minutes later.',
    },
    {
      id: 'stop',
      time: STOP + 1,
      view: { lat: 39, lon: -98, distance: 3.7 },
      label: 'National ground stop',
      title: 'National ground stop',
      tone: 'held',
      body: 'FAA advisory 111: all departing traffic to stay on the ground until further notice. The rings mark the 22 air route traffic control centers, all affected by the communications failure.',
    },
    {
      id: 'drain',
      time: at(18),
      view: { lat: 30, lon: -94, distance: 2.85 },
      label: 'Flights land',
      title: 'Flights land, none take off',
      tone: 'held',
      body: `At 6:00 p.m. there were <strong>${n(drain.now)}</strong> airline flights over the US, compared with ${n(drain.lastWeek)} the previous Friday. Red columns show each airport’s lost departures compared with the previous Friday.`,
    },
    {
      id: 'trickle',
      time: at(18, 55),
      view: { lat: 31, lon: -132, distance: 3.4 },
      label: 'During the stop',
      title: 'Departures during the stop',
      tone: 'released',
      body: `<strong>${n(s.duringStop.now)}</strong> flights left US airports between 3:54 and 8:16 p.m., compared with ${n(s.duringStop.lastWeek)} in the same hours the previous Friday. Green dots are flights that took off after 3:54 p.m.`,
    },
    {
      id: 'low',
      time: s.low.at,
      view: { lat: 36, lon: -98, distance: 4.2 },
      label: 'Fewest flights',
      title: 'Fewest flights',
      tone: 'held',
      body: `At ${time(s.low.at)} there were <strong>${n(s.low.airborne)}</strong> airline flights over the US. At the same time the previous Friday there were ${n(lowWeek.lastWeek)}.`,
    },
    {
      id: 'lift',
      time: LIFT + 2,
      view: { lat: 37, lon: -95, distance: 3.4 },
      label: 'Stop lifted',
      title: 'Ground stop lifted',
      tone: 'released',
      body: 'FAA advisory 005 cancelled the nationwide ground stop at 8:16 p.m. Transportation Secretary Sean Duffy said the recovery would be slow.',
    },
    {
      id: 'surge',
      time: s.surge.at,
      view: { lat: 39, lon: -99, distance: 3.25 },
      label: 'Departures resume',
      title: 'Departures resume',
      tone: 'released',
      body: `<strong>${n(s.surge.departures)}</strong> flights took off from US airports in the 15 minutes to ${time(s.surge.at)}, compared with ${n(surgeWeek.lastWeek)} the previous Friday. Between 8:41 and 11:17 p.m. the FAA issued 15 local ground stops at busy airports.`,
    },
    {
      id: 'latest',
      time: s.window.end,
      view: US,
      label: 'The night’s total',
      title: 'The night’s total',
      tone: 'neutral',
      body: `At ${time(s.window.end)}, ${n(latest.now)} airline flights were in the air, compared with ${n(latest.lastWeek)} the previous Friday. The 40 busiest airports had <strong>${n(s.behind.total)}</strong> fewer departures than the previous Friday${worst ? `, the most at ${worst.code} (${n(worst.behind)})` : ''}.`,
    },
  ];
  // Data-driven moments (the emptiest minute, the busiest surge) can land either side of fixed ones.
  return all.toSorted((a, b) => a.time - b.time);
};

/** The headline sentence, its pills pointing at moments. */
export const sentence = (s: DayStats): readonly Segment[] => [
  { _tag: 'Text', text: 'At ' },
  { _tag: 'Pill', label: '3:54 p.m.', moment: 'stop' },
  {
    _tag: 'Text',
    text: ' on Friday 13 November, the FAA stopped all departures from US airports. Airline flights over the US fell from ',
  },
  { _tag: 'Pill', label: n(s.airborne(at(15)).now), moment: 'normal' },
  { _tag: 'Text', text: ' to ' },
  { _tag: 'Pill', label: `${n(s.low.airborne)} at ${time(s.low.at)}`, moment: 'low' },
  { _tag: 'Text', text: '. The stop was lifted at ' },
  { _tag: 'Pill', label: '8:16 p.m.', moment: 'lift' },
  { _tag: 'Text', text: '.' },
];

/** The figures the live card quotes: the recorder's latest readings at the clock. */
export interface LiveFigures {
  readonly time: Minute;
  readonly airborne: number;
  /** Take-offs in the last 15 minutes. */
  readonly departures: number;
  /** Flights airborne at the same time a week earlier, once the recorder has that. */
  readonly lastWeek: number | null;
  /** Airports the FAA lists with a ground stop or delays, or null when its feed couldn't be read. */
  readonly delayed: number | null;
}

/** The card for the live stretch: what the recorder measured at the clock, in a moment's shape. */
export const liveMoment = (f: LiveFigures): Moment => ({
  id: 'live',
  time: f.time,
  view: US,
  label: 'Live',
  title: 'The sky right now',
  body:
    `<strong>${n(f.airborne)}</strong> airline flights are over the US` +
    (f.lastWeek === null ? '' : `, against ${n(f.lastWeek)} at this time last week`) +
    `, with <strong>${n(f.departures)}</strong> take-offs in the last 15 minutes.` +
    (f.delayed === null
      ? ''
      : f.delayed === 0
        ? ' The FAA lists no airport with delays.'
        : ` The FAA lists delays or stops at <strong>${n(f.delayed)}</strong> ${f.delayed === 1 ? 'airport' : 'airports'}.`),
  tone: 'released',
});
