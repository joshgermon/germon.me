import type { profile, career, stats, projects } from '@/data/profile';

export type LiveData = {
  profile: typeof profile;
  career: typeof career;
  stats: typeof stats;
  projects: typeof projects;
  photos: { src: string; caption: string; w: number; h: number; file: string }[];
  notes: { id: string; title: string; headline: string; date: string; short: string; mins: number }[];
  timeline: { y: number; v: number; label: string }[];
  commits: { h: string; m: string }[];
};
