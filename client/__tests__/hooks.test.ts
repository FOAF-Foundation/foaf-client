import type { FoafContactEdge } from '../src/contacts/types';
import type { FoafNetwork, TrustlineRow } from '../src/ledger/types';
import {
  buildViewerTrustlineBalance,
  NoFoafNetworkError,
  projectContact,
  resolveActiveNetwork,
  selectViewerTrustline,
  type ViewerTrustlineBalance,
} from '../src/ui/hooks/types';

// The hooks are exercised through the pure projection/builder/selector seams
// each one delegates to. testEnvironment is 'node' and the package ships no
// React renderer, so this covers the observable behaviour (AC-8, AC-10, EC-2,
// EC-4) without pulling in a render dependency.

function edge(overrides: Partial<FoafContactEdge> = {}): FoafContactEdge {
  return {
    foaf_id: 'foaf-1',
    created_at: '2026-01-01T00:00:00Z',
    created_via_invitation_id: null,
    user_name: 'ada',
    display_name: 'Ada Lovelace',
    avatar_url: null,
    foaf_address: '0xada',
    ...overrides,
  };
}

describe('useContacts projection (AC-10)', () => {
  it('maps every edge field and derives hasWallet=true for a confirmed contact', () => {
    const contact = projectContact(edge({ foaf_address: '0xada' }));

    expect(contact).toEqual({
      foaf_id: 'foaf-1',
      display_name: 'Ada Lovelace',
      user_name: 'ada',
      avatar_url: null,
      foaf_address: '0xada',
      created_at: '2026-01-01T00:00:00Z',
      created_via_invitation_id: null,
      hasWallet: true,
    });
  });

  it('keeps an unconfirmed contact in the list with hasWallet=false', () => {
    const contact = projectContact(edge({ foaf_address: null }));

    expect(contact.foaf_address).toBeNull();
    expect(contact.hasWallet).toBe(false);
  });
});

describe('useTrustlineBalances sign convention (AC-8)', () => {
  // userTrustlines rows are ALREADY viewer-oriented, so buildViewerTrustlineBalance
  // reads the balance/limits through WITHOUT negating: negative balance = the
  // viewer owes (i-owe), positive = the counterparty owes the viewer (owe-me).
  // `received` is the viewer's credit limit, `given` is the counterparty's.
  const viewer = '0xviewer';
  const counter = '0xcounter';

  it('reports i-owe (no negation) for an already-negative viewer balance', () => {
    const row: TrustlineRow = {
      counterParty: counter,
      balance: '-8.50',
      given: '40',
      received: '25',
    };

    const projected = buildViewerTrustlineBalance(row, viewer, counter);

    expect(projected.balance).toBe('-8.50');
    expect(projected.direction).toBe('i-owe');
    expect(projected.received).toBe('25'); // my credit limit
    expect(projected.given).toBe('40'); // their credit limit
  });

  it('reports owe-me (no negation) for an already-positive viewer balance', () => {
    const row: TrustlineRow = {
      counterParty: counter,
      balance: '8.50',
      given: '40',
      received: '25',
    };

    const projected = buildViewerTrustlineBalance(row, viewer, counter);

    expect(projected.balance).toBe('8.50');
    expect(projected.direction).toBe('owe-me');
  });

  it('reports settled for a zero balance', () => {
    const row: TrustlineRow = { counterParty: counter, balance: '0', given: '40', received: '25' };

    expect(buildViewerTrustlineBalance(row, viewer, counter).direction).toBe('settled');
  });

  it('leaves the full received limit available unless the viewer owes', () => {
    const oweMe: TrustlineRow = { counterParty: counter, balance: '8.50', given: '40', received: '25' };
    const oweMeProjected = buildViewerTrustlineBalance(oweMe, viewer, counter);
    expect(oweMeProjected.received).toBe('25');
    expect(oweMeProjected.availableCapacity).toBe('25');

    const iOwe: TrustlineRow = { counterParty: counter, balance: '-8.50', given: '40', received: '25' };
    // received (25) minus the outstanding balance (8.50) = 16.5.
    expect(buildViewerTrustlineBalance(iOwe, viewer, counter).availableCapacity).toBe('16.5');
  });
});

describe('resolveActiveNetwork guard (EC-4)', () => {
  it('returns the first network address when the tier exposes one', () => {
    const networks: FoafNetwork[] = [
      { address: '0xnet-a', decimals: 2, name: 'Alpha' },
      { address: '0xnet-b', decimals: 2, name: 'Beta' },
    ];

    expect(resolveActiveNetwork(networks)).toBe('0xnet-a');
  });

  it('returns a NoFoafNetworkError for an empty network list', () => {
    const resolved = resolveActiveNetwork([]);

    expect(resolved).toBeInstanceOf(NoFoafNetworkError);
    expect((resolved as NoFoafNetworkError).code).toBe('NO_FOAF_NETWORK');
  });
});

describe('useViewerTrustline null case (EC-2)', () => {
  // useViewerTrustline resolves its single pair through selectViewerTrustline;
  // testing that selector pins the "no trustline yet is null, not an error"
  // behaviour the hook exposes.
  it('returns null when the pair has no trustline in the balances map', () => {
    const balances = new Map<string, ViewerTrustlineBalance>();

    expect(selectViewerTrustline(balances, '0xcounter')).toBeNull();
  });

  it('returns the pair when the balances map holds it', () => {
    const entry: ViewerTrustlineBalance = {
      counterPartyAddress: '0xcounter',
      balance: '8.50',
      received: '40',
      given: '25',
      direction: 'owe-me',
      availableCapacity: '40',
    };
    const balances = new Map<string, ViewerTrustlineBalance>([['0xcounter', entry]]);

    expect(selectViewerTrustline(balances, '0xcounter')).toBe(entry);
  });
});
