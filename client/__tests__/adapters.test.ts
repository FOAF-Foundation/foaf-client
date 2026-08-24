import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DirectFoafAdapter, RailsV1Adapter } from '../src/adapters';
import type { FoafLedgerClient, TrustlineRow } from '../src/ledger';

describe('RailsV1Adapter', () => {
  it('unwraps Rails JSON API empty/list envelopes', async () => {
    const adapter = new RailsV1Adapter({
      get: async () => ({ data: { data: [] } }) as never,
      post: async () => ({ data: {} }) as never,
      put: async () => ({ data: {} }) as never,
      delete: async () => ({ data: {} }) as never,
    });
    await expect(adapter.listTrustlines()).resolves.toEqual([]);
  });
});

// Pins DirectFoafAdapter.mapTrustline against the SAME live-prod fixture the
// read-side hooks assert (contracts/user-trustlines-rows.json). The live wire
// key is `counterParty`; before the fix mapTrustline read only
// `counterPartyAddress`/`counter_party_address` and fell through to
// String(row.id) = "2" — the assertion on the counterparty address is what bites
// that bug. Ground truth: robin owes alex $166.80.
const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../contracts/user-trustlines-rows.json'), 'utf8'),
) as {
  robin: string;
  alex: string;
  rows: {
    robin_for_alex: {
      wire: TrustlineRow & { user: string; counterParty: string };
    };
  };
};

describe('DirectFoafAdapter.mapTrustline (live-prod fixture)', () => {
  it('robin viewing alex: resolves counterparty from the live counterParty key, not row.id', async () => {
    const { wire } = fixture.rows.robin_for_alex;
    const client = {
      userTrustlines: async () => [wire],
    } as unknown as FoafLedgerClient;

    const adapter = new DirectFoafAdapter({
      client,
      networkAddress: wire.currencyNetwork as string,
      viewerAddress: fixture.robin,
    });

    const [trustline] = await adapter.listTrustlines();

    // Pre-fix this was String(row.id) === "2" (garbage). Post-fix it is alex.
    expect(trustline.counterpartyAddress).toBe(fixture.alex);
    expect(trustline.id).toBe(fixture.alex);
    expect(trustline.balance).toBe(-166.8);
    expect(trustline.creditlineReceived).toBe(249.8); // my limit
    expect(trustline.creditlineGiven).toBe(240.0); // their limit
  });
});
