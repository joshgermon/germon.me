/**
 * Displacement-map generation for DOM liquid glass.
 *
 * Model (after kube.io's "Liquid Glass in the browser"): a slab of glass whose
 * edge is a convex squircle bezel. For each pixel we take its depth from the
 * shape's border, look up the bezel's slope there, refract a vertical ray with
 * Snell's law and store how far sideways it lands. `feDisplacementMap` then
 * samples the backdrop that far *inward* (backdrop-filter can only see pixels
 * under the element, so displacement must never point outwards).
 *
 * Encoding: R = x shift, G = y shift, 128 = no shift. The max magnitude is
 * normalised out, so the filter's `scale` attribute is the real pixel shift and
 * can be animated without rebuilding the map.
 */

export type BezelProfile = 'squircle' | 'circle' | 'lip';

export type MapOptions = {
  width: number;
  height: number;
  radius: number;
  /** Width of the curved edge in px. */
  bezel: number;
  profile?: BezelProfile;
  /** Index of refraction. 1.5 ≈ crown glass. */
  ior?: number;
  /** Max map resolution on the longest side — maps are smooth, so we can render small. */
  maxRes?: number;
};

const squircle = (x: number) => Math.pow(1 - Math.pow(1 - x, 4), 0.25);
const circle = (x: number) => Math.sqrt(1 - (1 - x) * (1 - x));
const smootherstep = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
const lip = (x: number) => {
  const convex = squircle(x);
  const concave = 1 - convex;
  const s = smootherstep(x);
  return convex * (1 - s) + concave * 0.15 * s + s * 0.85;
};

const profiles: Record<BezelProfile, (x: number) => number> = { squircle, circle, lip };

/** Signed distance to a rounded rectangle centred on the origin (negative inside). */
function sdRoundRect(px: number, py: number, hw: number, hh: number, r: number) {
  const qx = Math.abs(px) - hw + r;
  const qy = Math.abs(py) - hh + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/** 1D refraction lookup: depth-into-bezel (0..1) → lateral ray shift (unnormalised). */
function buildMagnitudeTable(profile: BezelProfile, ior: number, samples = 128) {
  const f = profiles[profile];
  const table = new Float32Array(samples);
  const d = 0.001;
  for (let i = 0; i < samples; i++) {
    const x = Math.min(Math.max(i / (samples - 1), d), 1 - d);
    const slope = (f(Math.min(x + d, 1)) - f(Math.max(x - d, 0))) / (2 * d);
    const theta1 = Math.atan(Math.abs(slope));
    const theta2 = Math.asin(Math.sin(theta1) / ior);
    // Lateral shift of the refracted ray through a unit-thick slab.
    table[i] = Math.tan(theta1 - theta2);
  }
  let max = 0;
  for (const v of table) max = Math.max(max, v);
  for (let i = 0; i < samples; i++) table[i] /= max || 1;
  return table;
}

const tableCache = new Map<string, Float32Array>();

export function displacementMap(opts: MapOptions): string {
  const { width, height, profile = 'squircle', ior = 1.5, maxRes = 640 } = opts;
  const k = Math.min(1, maxRes / Math.max(width, height));
  const w = Math.max(2, Math.round(width * k));
  const h = Math.max(2, Math.round(height * k));
  const r = Math.min(opts.radius, width / 2, height / 2) * k;
  const bezel = Math.max(1, opts.bezel * k);

  const key = `${profile}:${ior}`;
  let table = tableCache.get(key);
  if (!table) tableCache.set(key, (table = buildMagnitudeTable(profile, ior)));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const hw = w / 2;
  const hh = h / 2;
  const e = 0.5;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const px = x + 0.5 - hw;
      const py = y + 0.5 - hh;
      const sd = sdRoundRect(px, py, hw, hh, r);
      const depth = -sd;
      let dx = 0;
      let dy = 0;
      if (depth > 0 && depth < bezel) {
        // Outward normal from the SDF gradient.
        const gx = sdRoundRect(px + e, py, hw, hh, r) - sdRoundRect(px - e, py, hw, hh, r);
        const gy = sdRoundRect(px, py + e, hw, hh, r) - sdRoundRect(px, py - e, hw, hh, r);
        const gl = Math.hypot(gx, gy) || 1;
        const t = depth / bezel;
        const m = table[Math.min(table.length - 1, Math.floor(t * (table.length - 1)))];
        // Sample inward: shift = -normal × magnitude.
        dx = (-gx / gl) * m;
        dy = (-gy / gl) * m;
      }
      data[i] = 128 + dx * 127;
      data[i + 1] = 128 + dy * 127;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/**
 * Specular rim map: white where the bezel faces the light, alpha falls off into
 * the interior. Rendered once per size; the CSS rim layer handles the
 * pointer-tracking highlight on top of it.
 */
export function specularMap(opts: MapOptions & { lightAngle?: number; strength?: number }): string {
  const { width, height, maxRes = 640, lightAngle = -135, strength = 1 } = opts;
  const k = Math.min(1, maxRes / Math.max(width, height));
  const w = Math.max(2, Math.round(width * k));
  const h = Math.max(2, Math.round(height * k));
  const r = Math.min(opts.radius, width / 2, height / 2) * k;
  const bezel = Math.max(1, opts.bezel * k);
  const lx = Math.cos((lightAngle * Math.PI) / 180);
  const ly = Math.sin((lightAngle * Math.PI) / 180);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const hw = w / 2;
  const hh = h / 2;
  const e = 0.5;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const px = x + 0.5 - hw;
      const py = y + 0.5 - hh;
      const sd = sdRoundRect(px, py, hw, hh, r);
      const depth = -sd;
      let a = 0;
      if (depth > 0 && depth < bezel) {
        const gx = sdRoundRect(px + e, py, hw, hh, r) - sdRoundRect(px - e, py, hw, hh, r);
        const gy = sdRoundRect(px, py + e, hw, hh, r) - sdRoundRect(px, py - e, hw, hh, r);
        const gl = Math.hypot(gx, gy) || 1;
        const facing = (gx / gl) * lx + (gy / gl) * ly;
        const rim = Math.pow(1 - depth / bezel, 3);
        // Key light + a fainter bounce from the opposite side.
        a = (Math.pow(Math.max(0, facing), 2.5) + 0.35 * Math.pow(Math.max(0, -facing), 3)) * rim * strength;
      }
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}
