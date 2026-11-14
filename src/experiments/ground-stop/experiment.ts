import { defineExperiment } from '~/experiments/kit/manifest';

/** Ground stop: the FAA's nationwide ground stop of 13 Nov 2026, in real flight data. */
export const experiment = defineExperiment({
  slug: 'ground-stop',
  title: 'Ground stop',
  description:
    'Real flight data for the FAA’s nationwide ground stop on 13 November 2026, compared with the previous Friday, and the sky as it is now.',
  published: '2026-11-14',
  status: 'live',
  // pnpm build && pnpm experiment:og ground-stop m=low
  image: {
    path: '/experiments/ground-stop/og.jpg',
    alt: 'A dot-matrix globe of North America at 8:39 p.m. ET on 13 November 2026: few flights over the US, and red columns at airports showing departures lost compared with the previous Friday.',
  },
});
