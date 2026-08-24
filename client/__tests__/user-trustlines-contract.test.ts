import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrustlineRow } from '../src/ledger/types';
import { buildViewerTrustlineBalance, trustlineCounterParty } from '../src/ui/hooks/types';

// Pins the read-side (userTrustlines) projection against the shared, live-prod
// fixture so the TS hooks and the Ruby gem cannot re-drift. The SAME
// contracts/user-trustlines-rows.json is asserted by gem/spec/foaf/user_trustlines_spec.rb.
//
// These rows are ALREADY viewer-oriented (the per-viewer endpoint applies the
// viewer's perspective), so viewerBalance must NOT negate them. Ground truth:
// robin owes alex $166.80.
interface FixtureCase {
  wire: TrustlineRow & { user: string; counterParty: string };
  expected: {
    counterParty: string;
    viewer_balance: string;
    direction: string;
    my_credit_limit: string;
    their_credit_limit: string;
  };
}

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../contracts/user-trustlines-rows.json'), 'utf8'),
) as { rows: { robin_for_alex: FixtureCase; alex_for_robin: FixtureCase } };

describe('userTrustlines read-side contract (live-prod fixture)', () => {
  it('reads the live wire counterParty key', () => {
    const { wire } = fixture.rows.robin_for_alex;
    expect(trustlineCounterParty(wire)).toBe(fixture.rows.robin_for_alex.expected.counterParty);
  });

  it('robin owes alex: i-owe, -166.8, mine=249.8, theirs=240.0 (no negation)', () => {
    const { wire, expected } = fixture.rows.robin_for_alex;
    const projected = buildViewerTrustlineBalance(wire, wire.user, expected.counterParty);

    expect(projected.direction).toBe('i-owe');
    expect(Number(projected.balance)).toBe(Number(expected.viewer_balance)); // -166.8
    expect(Number(projected.received)).toBe(Number(expected.my_credit_limit)); // 249.8
    expect(Number(projected.given)).toBe(Number(expected.their_credit_limit)); // 240.0
  });

  it('alex is owed by robin (counterparty view): owe-me, +166.8', () => {
    const { wire, expected } = fixture.rows.alex_for_robin;
    const projected = buildViewerTrustlineBalance(wire, wire.user, expected.counterParty);

    expect(projected.direction).toBe('owe-me');
    expect(Number(projected.balance)).toBe(Number(expected.viewer_balance)); // 166.8
    expect(Number(projected.received)).toBe(Number(expected.my_credit_limit)); // 240.0
    expect(Number(projected.given)).toBe(Number(expected.their_credit_limit)); // 249.8
  });
});
