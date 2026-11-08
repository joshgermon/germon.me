/**
 * The office export's contract: asset URLs (owned by the Blender exporter; the viewer only
 * reads them) and the node names the viewer looks for in `office.glb`.
 */

/** Where the exporter publishes the room. */
export const ASSETS = {
  glb: '/office/office.glb',
  manifest: '/office/manifest.json',
} as const;

/** Node names from the GLB contract. */
export const NODE = {
  camera: 'CAM_Iso',
  screens: {
    nvim: 'SCREEN_Nvim',
    term: 'SCREEN_Term',
    simL: 'SCREEN_SimL',
    simC: 'SCREEN_SimC',
    simR: 'SCREEN_SimR',
  },
  cursor: 'FX_CursorBlink',
  ampJewel: 'FX_AmpJewel',
  lampShade: 'FX_LampShade',
  ball: 'BALL',
  hoopTarget: 'HOOP_Target',
  hoopNet: 'HOOP_Net',
  shafts: ['FX_LightShaft_Back', 'FX_LightShaft_Left'],
  dustVolume: 'FX_DustVolume',
  windPrefix: 'WIND_',
  hotspotPrefix: 'HS_',
  hitPrefix: 'HIT_',
  /** Material name the exporter gives invisible colliders. */
  hitMaterial: 'HIT',
} as const;
