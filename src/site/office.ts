/**
 * Everything a visitor reads in the 3D office: the card's chrome, each object's label, its
 * detail panel and its palette row. Change office copy here, never in components.
 *
 * Facts about Josh come from `profile.ts`. A line not written yet can be a `Todo` — shown
 * (dashed) in development so it's easy to find, left out of the production page.
 */
import type { IconName } from '~/components/ui/icons';
import { hotspotIds, type HotspotId } from '~/domain/office/hotspot';
import type { Action } from '~/lib/actions';
import { profile } from './profile';

/** A line of copy still to be written. */
export type Todo = { readonly _tag: 'Todo'; readonly hint: string };

/** One line of panel copy: written, or still to write. */
export type Line = string | Todo;

/** A labelled fact in a panel's "Information" rows. */
export type PanelFact = { readonly label: string; readonly value: string };

/** A button at the foot of a panel. */
export type PanelLink = { readonly label: string; readonly action: Action };

/** A book on the shelf. */
export type ReadingEntry = { readonly title: Line; readonly author: Line; readonly note?: Line };

/** What the detail panel (desktop) or sheet (phone) shows for an object. */
export type HotspotPanel = {
  readonly title: string;
  readonly body: ReadonlyArray<Line>;
  readonly facts: ReadonlyArray<PanelFact>;
  readonly reading?: ReadonlyArray<ReadingEntry>;
  readonly links: ReadonlyArray<PanelLink>;
};

/** What pointing at an object does. */
export type HotspotKind =
  /** Glide the camera to it and open its panel. `simLive` starts the sim screens. */
  | { readonly _tag: 'Focus'; readonly panel: HotspotPanel; readonly simLive?: boolean }
  /** Switch the room between its daylight and evening bakes. */
  | { readonly _tag: 'Lamp' }
  /** Throw the ball at the mini hoop. */
  | { readonly _tag: 'Shoot' };

/** An object in the office, as the card, the panel and the palette present it. */
export type Hotspot = {
  readonly id: HotspotId;
  /** Hover label and list row. */
  readonly label: string;
  /** The list button's accessible name. */
  readonly ariaLabel: string;
  readonly icon: IconName;
  /** Shown in the card's list (the hoop shares the ball's shot, so only the ball is listed). */
  readonly listed: boolean;
  /** Its palette row; omitted for objects that duplicate another's. */
  readonly command?: {
    readonly title: string;
    readonly keywords: string;
    readonly description: string;
  };
  readonly kind: HotspotKind;
};

/** The card's own copy. */
export const office = {
  title: 'My Office',
  meta: 'Drag to look around · pinch to zoom',
  label: 'Josh’s office in 3D — drag to look around, or pick an object for a closer look',
  posterAlt:
    'An isometric home office: a desk with two monitors, a racing sim rig, a Telecaster, an acoustic guitar and a Vox amp, a framed jersey, a model F1 car, a helmet, books, a lamp and plants by the window.',
  listLabel: 'In the office',
  loading: 'Loading the room',
  close: 'Back to the room',
  information: 'Information',
  lamp: { on: 'On', off: 'Off', day: 'Daylight', evening: 'Evening light' },
  zoom: { in: 'Zoom in', out: 'Zoom out', label: 'Zoom' },
  shot: 'Nothing but net',
  missed: 'The ball’s still rolling',
} as const;

const notes: Action = { _tag: 'OpenPalette', view: { _tag: 'Notes' } };

const byId = {
  Monitor: {
    label: 'Desk',
    ariaLabel: 'Desk: take a closer look',
    icon: 'code',
    listed: true,
    command: {
      title: 'Look at the Desk',
      keywords: 'office monitor screens neovim terminal setup computer',
      description: 'Where the work happens: Neovim on one screen, a terminal on the other.',
    },
    kind: {
      _tag: 'Focus',
      panel: {
        title: 'The desk',
        body: [
          'Neovim on the left, a terminal on the right, and some Rust that compiled on the first try (it did not).',
          'A split keyboard, AirPods Max on their stand for deep-work mode, and a latte going cold beside a stack of books I swear I’m reading.',
        ],
        facts: [
          { label: 'Building', value: profile.now.building },
          { label: 'Learning', value: profile.now.learning },
        ],
        links: [
          { label: 'Browse Notes', action: notes },
          { label: 'Try the Terminal', action: { _tag: 'ShowWidget', widget: 'terminal' } },
        ],
      },
    },
  },
  Sim: {
    label: 'Sim rig',
    ariaLabel: 'Racing sim rig: take a closer look',
    icon: 'wheel',
    listed: true,
    command: {
      title: 'Look at the Sim Rig',
      keywords: 'office racing simulator wheel pedals f1 driving',
      description: 'Direct drive, load-cell pedals, three screens wide.',
    },
    kind: {
      _tag: 'Focus',
      simLive: true,
      panel: {
        title: 'Sim rig',
        body: [
          'Three screens wrapped around a bucket seat on an aluminium rig, so a lap of Suzuka feels like the real thing — minus the g-force and the salary.',
          'Mostly F1 and GT3. I’m chasing tenths through the Esses and losing them all again at the hairpin.',
        ],
        facts: [
          { label: 'Wheelbase', value: 'Direct drive' },
          { label: 'Pedals', value: 'Load cell' },
          { label: 'Screens', value: 'Triple, wrap-around' },
          { label: 'Favourite track', value: 'Suzuka' },
        ],
        links: [],
      },
    },
  },
  Tele: {
    label: 'Telecaster',
    ariaLabel: 'Telecaster guitar: take a closer look',
    icon: 'guitar',
    listed: true,
    command: {
      title: 'Look at the Telecaster',
      keywords: 'office guitar electric fender music',
      description: 'Butter yellow with a black pickguard: the plainest, best guitar there is.',
    },
    kind: {
      _tag: 'Focus',
      panel: {
        title: 'Telecaster',
        body: [
          'Butter yellow with a black pickguard — a slab of wood, two pickups and a switch. Seventy-odd years on, nobody has really improved on it.',
          'It lives on the wall within arm’s reach, which is the only way a guitar gets played between builds.',
        ],
        facts: [
          { label: 'Finish', value: 'Butter yellow' },
          { label: 'Pickguard', value: 'Black' },
          { label: 'Into', value: 'Vox AC30' },
        ],
        links: [],
      },
    },
  },
  Acoustic: {
    label: 'Acoustic',
    ariaLabel: 'Acoustic guitar: take a closer look',
    icon: 'guitar',
    listed: true,
    command: {
      title: 'Look at the Acoustic',
      keywords: 'office guitar acoustic music cole clark fat lady fl2',
      description: 'A Cole Clark Fat Lady 2, built from Australian timbers in Melbourne.',
    },
    kind: {
      _tag: 'Focus',
      panel: {
        title: 'Cole Clark Fat Lady 2',
        body: [
          'Made in Melbourne from Australian timbers, with a cutaway for the high stuff and a pickup system that makes it sound like itself through a PA, not a piezo.',
          'It’s the one I grab first — on the couch, by the window, or whenever a build needs ten minutes to think.',
        ],
        facts: [
          { label: 'Maker', value: 'Cole Clark' },
          { label: 'Model', value: 'Fat Lady 2' },
          { label: 'Built in', value: 'Melbourne, Australia' },
        ],
        links: [],
      },
    },
  },
  Amp: {
    label: 'AC30',
    ariaLabel: 'Vox AC30 amplifier: take a closer look',
    icon: 'amp',
    listed: true,
    command: {
      title: 'Look at the Vox AC30',
      keywords: 'office amp amplifier vox guitar music',
      description: 'Thirty watts of chime: the sound of half the records I love.',
    },
    kind: {
      _tag: 'Focus',
      panel: {
        title: 'Vox AC30',
        body: [
          'Thirty watts, two twelves and that chime — the sound of half the records I love. Far too loud for a home office, which has never once stopped me.',
          'The pedalboard beside it does the rest, though most nights it’s the Tele straight in.',
        ],
        facts: [
          { label: 'Output', value: '30 W' },
          { label: 'Speakers', value: '2 × 12″' },
          { label: 'Valves', value: '4 × EL84' },
        ],
        links: [],
      },
    },
  },
  Jersey: {
    label: 'Curry #30',
    ariaLabel: 'Framed Stephen Curry jersey: take a closer look',
    icon: 'shirt',
    listed: true,
    command: {
      title: 'Look at the Curry Jersey',
      keywords: 'office basketball nba warriors stephen curry 30 framed',
      description: 'Steph’s rookie-season road jersey, framed under four banners.',
    },
    kind: {
      _tag: 'Focus',
      panel: {
        title: 'Curry #30',
        body: [
          'Steph’s rookie-season navy, from before anyone knew what was coming. Four championship banners hang across the room to prove it.',
          'Dub Nation from Sydney means a lot of tip-offs in the middle of a workday. Worth it.',
        ],
        facts: [
          { label: 'Season', value: '2009–10, his rookie year' },
          { label: 'Banners', value: '2015 · 2017 · 2018 · 2022' },
        ],
        links: [],
      },
    },
  },
  Ferrari: {
    label: 'F2007',
    ariaLabel: 'Ferrari F2007 scale model: take a closer look',
    icon: 'flag',
    listed: true,
    command: {
      title: 'Look at the Ferrari F2007',
      keywords: 'office formula 1 f1 model car scale racing ferrari lewis hamilton kimi raikkonen',
      description: 'The car that beat rookie Lewis Hamilton to the 2007 title by a single point.',
    },
    kind: {
      _tag: 'Focus',
      panel: {
        title: 'Ferrari F2007',
        body: [
          'Kimi’s F2007 — the car that beat a rookie Lewis Hamilton to the 2007 title by a single point. It took him eighteen years, and seven titles elsewhere, to end up in red.',
          'Now it sits on the plinth next to the yellow helmet, and the 44 print watches over the sim. Forza Lewis.',
        ],
        facts: [
          { label: 'Scale', value: '1:4.5' },
          { label: 'Season', value: '2007' },
          { label: 'Champion', value: 'Kimi Räikkönen' },
        ],
        links: [],
      },
    },
  },
  Helmet: {
    label: 'Helmet',
    ariaLabel: 'Racing helmet: take a closer look',
    icon: 'flag',
    listed: true,
    command: {
      title: 'Look at the Helmet',
      keywords: 'office racing helmet gt3 motorsport lewis hamilton yellow',
      description: 'A GT3 helmet in yellow, after Lewis’s early lids.',
    },
    kind: {
      _tag: 'Focus',
      panel: {
        title: 'GT3 helmet',
        body: [
          'A closed-face GT3 helmet in yellow, a nod to the lid Lewis wore from karting through his first world title.',
          'It’s seen more sim laps than real ones. For now.',
        ],
        facts: [
          { label: 'Type', value: 'GT3, closed face' },
          { label: 'Colour', value: 'Hamilton yellow' },
        ],
        links: [],
      },
    },
  },
  Books: {
    label: 'Reading list',
    ariaLabel: 'Bookshelf: show the reading list',
    icon: 'book',
    listed: true,
    command: {
      title: 'Look at the Reading List',
      keywords: 'office books bookshelf reading',
      description: 'What’s on the shelf.',
    },
    kind: {
      _tag: 'Focus',
      panel: {
        title: 'Reading list',
        body: ['What’s on the shelf right now — the ones with the most sticky notes.'],
        facts: [],
        reading: [
          {
            title: 'Designing Data-Intensive Applications',
            author: 'Martin Kleppmann',
            note: 'The one I keep coming back to.',
          },
          {
            title: 'A Philosophy of Software Design',
            author: 'John Ousterhout',
            note: 'Deep modules, always.',
          },
          {
            title: 'The Rust Programming Language',
            author: 'Steve Klabnik & Carol Nichols',
            note: 'Slowly, with the borrow checker.',
          },
        ],
        links: [],
      },
    },
  },
  Lamp: {
    label: 'Lamp',
    ariaLabel: 'Lamp: switch between daylight and evening light',
    icon: 'lamp',
    listed: true,
    command: {
      title: 'Switch the Lamp',
      keywords: 'office light lamp evening night day sun dark',
      description:
        'The room follows the sun in Sydney — daylight while it’s up, the lamp after dark. Flip it yourself.',
    },
    kind: { _tag: 'Lamp' },
  },
  Ball: {
    label: 'Shoot',
    ariaLabel: 'Basketball: take a shot at the mini hoop',
    icon: 'ball',
    listed: true,
    command: {
      title: 'Shoot a Hoop',
      keywords: 'office basketball ball hoop shot game',
      description: 'Take a shot at the mini hoop.',
    },
    kind: { _tag: 'Shoot' },
  },
  Hoop: {
    label: 'Mini hoop',
    ariaLabel: 'Mini hoop: take a shot',
    icon: 'ball',
    listed: false,
    kind: { _tag: 'Shoot' },
  },
} as const satisfies { readonly [K in HotspotId]: Omit<Hotspot, 'id'> };

/** Every object, in the order the room lists them. */
export const hotspots: ReadonlyArray<Hotspot> = hotspotIds.map((id) => ({ id, ...byId[id] }));

/**
 * Look up an object's copy.
 *
 * @param id - The hotspot.
 * @returns Its copy.
 */
export function hotspot(id: HotspotId): Hotspot {
  return { id, ...byId[id] };
}
