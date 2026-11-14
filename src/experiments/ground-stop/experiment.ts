import { defineExperiment } from '~/experiments/kit/manifest';

/** Ground stop: the FAA's nationwide ground stop of 13 Nov 2026, in real flight data. */
export const experiment = defineExperiment({
  slug: 'ground-stop',
  title: 'Ground stop',
  description:
    'Real flight data for the FAA’s nationwide ground stop on 13 November 2026, compared with the previous Friday, with live updates.',
  published: '2026-11-14',
  status: 'live',
  // 8:30 a.m. ET Saturday: past WINDOW_LIMIT, the backlog has cleared.
  refreshUntil: '2026-11-14T13:30:00Z',
});
