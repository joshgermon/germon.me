/**
 * The 22 Air Route Traffic Control Centers: the facilities that run high-altitude airspace,
 * and the ones the communication failure hit ("impacting all Air Route Traffic Control
 * Centers", Sec. Duffy). Positions are each centre's facility, near the city it is named for.
 */
import type { LatLon } from './sphere';

/** An en-route centre. */
export interface Centre extends LatLon {
  /** ICAO facility identifier, e.g. ZNY. */
  readonly id: string;
  readonly name: string;
}

const c = (id: string, name: string, lat: number, lon: number): Centre => ({ id, name, lat, lon });

/** All 22 ARTCCs. */
export const CENTRES: readonly Centre[] = [
  c('ZAB', 'Albuquerque', 35.173, -106.567),
  c('ZAN', 'Anchorage', 61.229, -149.781),
  c('ZAU', 'Chicago', 41.782, -88.331),
  c('ZBW', 'Boston', 42.736, -71.481),
  c('ZDC', 'Washington', 39.102, -77.543),
  c('ZDV', 'Denver', 40.187, -105.127),
  c('ZFW', 'Fort Worth', 32.831, -97.067),
  c('ZHN', 'Honolulu', 21.322, -157.926),
  c('ZHU', 'Houston', 29.962, -95.332),
  c('ZID', 'Indianapolis', 39.738, -86.281),
  c('ZJX', 'Jacksonville', 30.699, -81.908),
  c('ZKC', 'Kansas City', 38.88, -94.791),
  c('ZLA', 'Los Angeles', 34.603, -118.084),
  c('ZLC', 'Salt Lake City', 40.786, -111.952),
  c('ZMA', 'Miami', 25.825, -80.319),
  c('ZME', 'Memphis', 35.067, -89.955),
  c('ZMP', 'Minneapolis', 44.637, -93.153),
  c('ZNY', 'New York', 40.784, -73.097),
  c('ZOA', 'Oakland', 37.543, -122.016),
  c('ZOB', 'Cleveland', 41.297, -82.206),
  c('ZSE', 'Seattle', 47.287, -122.189),
  c('ZTL', 'Atlanta', 33.38, -84.297),
];
