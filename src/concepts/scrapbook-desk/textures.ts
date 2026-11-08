/**
 * Procedural material textures (SVG feTurbulence → data URLs). No image assets.
 * Each one is a seamless tile (stitchTiles) used as a CSS background layer.
 */

export const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}")`;

/** A noise layer: turbulence → alpha from R → optional table → flat colour. */
const layer = (
  id: string,
  freq: string,
  oct: number,
  seed: number,
  rgb: [number, number, number],
  table: string,
  type: 'fractalNoise' | 'turbulence' = 'fractalNoise',
) => `
  <filter id='${id}' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>
    <feTurbulence type='${type}' baseFrequency='${freq}' numOctaves='${oct}' seed='${seed}' stitchTiles='stitch'/>
    <feColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0'/>
    <feComponentTransfer><feFuncA type='table' tableValues='${table}'/></feComponentTransfer>
    <feColorMatrix type='matrix' values='0 0 0 0 ${rgb[0]} 0 0 0 0 ${rgb[1]} 0 0 0 0 ${rgb[2]} 0 0 0 1 0'/>
  </filter>
  <rect width='100%' height='100%' filter='url(#${id})'/>`;

/**
 * American black walnut veneer, grain running left↔right.
 * Long, wavy dark streaks (banded low-y-frequency noise), a soft tonal
 * "figure", lighter sapwood flecks and tiny open pores.
 */
export const woodSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='1800' height='900'>
  <rect width='100%' height='100%' fill='#56392a'/>
  ${layer('f', '0.0007 0.005', 3, 3, [0.74, 0.55, 0.4], '0 0 0.04 0.12 0.2')}
  ${layer('g', '0.0011 0.0105', 4, 11, [0.16, 0.09, 0.05], '0 0.5 0 0.5 0 0.5 0 0.5 0 0.5 0 0.5 0 0.5 0 0.5 0 0.5 0 0.5 0 0.5 0 0.5 0 0.5 0 0.5 0 0.5 0')}
  ${layer('l', '0.0013 0.012', 3, 23, [0.72, 0.53, 0.38], '0 0.16 0 0.16 0 0.16 0 0.16 0 0.16 0 0.16 0 0.16 0 0.16 0 0.16 0 0.16 0 0.16 0')}
  ${layer('h', '0.004 0.16', 3, 27, [0.18, 0.1, 0.06], '0 0 0.12 0 0 0.1 0 0')}
  ${layer('p', '0.014 0.5', 2, 5, [0.09, 0.05, 0.03], '0 0 0 0 0 0 0 0.3 0.65')}
</svg>`;

/** Charcoal wool felt: dense fibre speckle plus a gentle mottle. */
export const feltSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'>
  <rect width='100%' height='100%' fill='#3a3936'/>
  ${layer('m', '0.012', 3, 7, [0.55, 0.54, 0.52], '0 0 0.05 0.1')}
  ${layer('a', '0.85', 3, 2, [0.75, 0.74, 0.72], '0 0 0 0 0.18 0.35')}
  ${layer('b', '0.7', 2, 9, [0.08, 0.08, 0.07], '0 0 0 0 0.2 0.4')}
  ${layer('c', '0.12 0.9', 2, 19, [0.7, 0.69, 0.66], '0 0 0 0 0 0 0.12')}
</svg>`;

/** Uncoated cotton paper tooth — transparent, overlaid on paper colour. */
export const paperSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'>
  ${layer('a', '0.9', 3, 4, [0.35, 0.3, 0.24], '0 0 0 0.04 0.09')}
  ${layer('b', '0.035', 2, 8, [0.5, 0.45, 0.38], '0 0 0.025 0.05')}
</svg>`;

/** Book cloth: horizontal + vertical thread noise. */
export const clothSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'>
  ${layer('a', '0.9 0.05', 2, 3, [1, 1, 1], '0 0 0.05 0.14')}
  ${layer('b', '0.05 0.9', 2, 6, [0, 0, 0], '0 0 0.08 0.2')}
  ${layer('c', '0.02', 2, 12, [0, 0, 0], '0 0.05 0.1')}
</svg>`;
