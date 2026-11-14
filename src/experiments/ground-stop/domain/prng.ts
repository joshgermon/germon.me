/**
 * A tiny seeded PRNG (mulberry32), so the traffic model draws the same sky on every load and in
 * every test.
 */

/** A source of uniform numbers in [0, 1). */
export type Random = () => number;

/** A deterministic generator for a 32-bit seed. */
export const seeded = (seed: number): Random => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Index into `weights` with probability proportional to each weight (cumulative table). */
export const weightedIndex = (cumulative: Float64Array, random: Random): number => {
  const total = cumulative[cumulative.length - 1] ?? 0;
  const target = random() * total;
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((cumulative[mid] ?? 0) > target) hi = mid;
    else lo = mid + 1;
  }
  return lo;
};

/** Running sums of `weights`, for `weightedIndex`. */
export const cumulate = (weights: readonly number[]): Float64Array => {
  const out = new Float64Array(weights.length);
  let sum = 0;
  weights.forEach((w, i) => {
    sum += w;
    out[i] = sum;
  });
  return out;
};
