import { describe, expect, it } from 'vitest';

import { parseNasStatus } from './faa-nas';

const XML = `<AIRPORT_STATUS_INFORMATION><Update_Time>Sat Nov 14 05:30:04 2026 GMT</Update_Time>
<Delay_type><Name>Ground Delay Programs</Name><Ground_Delay_List><Ground_Delay><ARPT>SFO</ARPT><Reason>wind</Reason><Avg>2 hours and 18 minutes</Avg><Max>11 hours and 30 minutes</Max></Ground_Delay></Ground_Delay_List></Delay_type>
<Delay_type><Name>Airport Closures</Name><Airport_Closure_List>
<Airport><ARPT>LAX</ARPT><Reason>!LAX 05/277 LAX AD AP CLSD TO NON SKED TRANSIENT GA ACFT</Reason><Start>May 27</Start><Reopen>May 28</Reopen></Airport>
<Airport><ARPT>DCA</ARPT><Reason>!DCA 11/261 DCA AD AP CLSD TO DIVERSION ACFT DUE TO CAPACITY</Reason><Start>Nov 14 at 00:04 UTC.</Start><Reopen>Nov 14 at 11:00 UTC.</Reopen></Airport>
</Airport_Closure_List></Delay_type></AIRPORT_STATUS_INFORMATION>`;

describe('FAA NAS status', () => {
  it('reads delay programs and newsworthy closures, skipping standing GA notices', () => {
    const { updated, statuses } = parseNasStatus(XML);
    expect(updated).toBe('Sat Nov 14 05:30:04 2026 GMT');
    expect(statuses).toEqual([
      {
        airport: 'SFO',
        kind: 'GroundDelay',
        reason: 'wind',
        detail: 'avg 2 hours and 18 minutes, max 11 hours and 30 minutes',
      },
      {
        airport: 'DCA',
        kind: 'Closure',
        reason: 'closed to diversions (capacity)',
        detail: 'reopens Nov 14 at 11:00 UTC',
      },
    ]);
  });

  it('survives an empty or unexpected document', () => {
    expect(parseNasStatus('<nope/>').statuses).toEqual([]);
  });
});
