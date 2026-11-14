/**
 * OurAirports' airport list (public domain, `airports.csv`), parsed at the boundary into the
 * few fields the bake script needs: scheduled-service airports big enough to matter.
 */
import { z } from 'zod';

/** An airport with scheduled service. */
export interface AirportRecord {
  /** IATA code where there is one, else the ICAO/GPS ident. */
  readonly code: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly country: string;
  readonly size: 'large' | 'medium';
}

const Row = z.object({
  ident: z.string().min(1),
  type: z.enum(['large_airport', 'medium_airport']),
  name: z.string(),
  latitude_deg: z.coerce.number().min(-90).max(90),
  longitude_deg: z.coerce.number().min(-180).max(180),
  iso_country: z.string().length(2),
  scheduled_service: z.literal('yes'),
  iata_code: z.string(),
});

/** Split one CSV line, honouring double-quoted fields. */
const fields = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
};

/** Parse the CSV, keeping large and medium airports with scheduled service. */
export const parseAirports = (csv: string): AirportRecord[] => {
  const [header, ...lines] = csv.split(/\r?\n/);
  const names = fields(header ?? '');
  const out: AirportRecord[] = [];
  for (const line of lines) {
    if (!line) continue;
    const values = fields(line);
    const row = Row.safeParse(Object.fromEntries(names.map((n, i) => [n, values[i] ?? ''])));
    if (!row.success) continue;
    const r = row.data;
    out.push({
      code: (r.iata_code || r.ident).slice(0, 4),
      name: r.name,
      lat: r.latitude_deg,
      lon: r.longitude_deg,
      country: r.iso_country,
      size: r.type === 'large_airport' ? 'large' : 'medium',
    });
  }
  return out;
};
