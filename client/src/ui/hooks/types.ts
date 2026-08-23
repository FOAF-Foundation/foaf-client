import { viewerBalance } from '../../ledger/balances';
import type { FoafNetwork, TrustlineRow } from '../../ledger/types';
import type { FoafContactEdge } from '../../contacts/types';

/**
 * App-facing projection of a canonical contact edge. `hasWallet` is derived once
 * here (a confirmed contact carries a non-null `foaf_address`) so screens never
 * re-check the address inline.
 */
export interface FoafContact {
  foaf_id: string;
  display_name: string | null;
  user_name: string | null;
  avatar_url: string | null;
  foaf_address: string | null;
  created_at: string | null;
  created_via_invitation_id: string | null;
  hasWallet: boolean;
}

export type TrustlineDirection = 'owe-me' | 'i-owe' | 'settled';

/**
 * Viewer-oriented trustline projection. `balance`, `received`, and `given` are
 * already flipped into the viewer's perspective by `viewerBalance`, so
 * `direction` is derived from the POST-FLIP balance:
 *   balance > 0 → counterparty owes the viewer → 'owe-me'
 *   balance < 0 → the viewer owes the counterparty → 'i-owe'
 * This is the opposite of the raw creditor-oriented protocol sign.
 */
export interface ViewerTrustlineBalance {
  counterPartyAddress: string;
  balance: string;
  received: string;
  given: string;
  direction: TrustlineDirection;
  availableCapacity: string;
}

/**
 * Minimal narrowing of the untyped events `FoafLedgerClient.trustlineEvents`
 * returns. Only the three fields the UI relies on are claimed; everything else
 * passes through so callers can read event-type-specific fields ad hoc.
 */
export interface TrustlineEvent {
  id: string | number;
  amount: string | number;
  created_at: string;
  [key: string]: unknown;
}

/** Raised (as returned state, never thrown to a caller) when a tier has no FOAF network. */
export class NoFoafNetworkError extends Error {
  readonly code = 'NO_FOAF_NETWORK' as const;

  constructor() {
    super('No FOAF network available');
    this.name = 'NoFoafNetworkError';
  }
}

/**
 * Pure, synchronous core of {@link useActiveNetwork}. Returns the first
 * network's address, or a `NoFoafNetworkError` when the tier exposes none.
 * Kept pure so the empty-array guard is unit-testable without async.
 */
export function resolveActiveNetwork(networks: FoafNetwork[]): string | NoFoafNetworkError {
  const first = networks[0];
  if (!first) return new NoFoafNetworkError();
  return first.address;
}

/** Pure projection: canonical contact edge → app-facing {@link FoafContact}. */
export function projectContact(edge: FoafContactEdge): FoafContact {
  return {
    foaf_id: edge.foaf_id,
    display_name: edge.display_name,
    user_name: edge.user_name,
    avatar_url: edge.avatar_url,
    foaf_address: edge.foaf_address,
    created_at: edge.created_at,
    created_via_invitation_id: edge.created_via_invitation_id,
    hasWallet: edge.foaf_address !== null,
  };
}

function directionOf(balance: string): TrustlineDirection {
  const n = Number(balance);
  if (n > 0) return 'owe-me';
  if (n < 0) return 'i-owe';
  return 'settled';
}

/**
 * Remaining headroom on the viewer's credit limit. For 'owe-me' and 'settled'
 * the full `received` limit is available; for 'i-owe' the outstanding balance
 * has already consumed part of it.
 */
function availableCapacityOf(
  direction: TrustlineDirection,
  received: string,
  balance: string,
): string {
  if (direction === 'i-owe') {
    const remaining = Number(received) - Math.abs(Number(balance));
    return String(Math.max(0, remaining));
  }
  return received;
}

/**
 * Pure builder: a raw protocol trustline row → viewer-oriented balance.
 * Delegates the sign/limit flip to `viewerBalance` (the one place that owns the
 * convention), then derives `direction` and `availableCapacity` from its output.
 */
export function buildViewerTrustlineBalance(
  row: TrustlineRow,
  viewerAddress: string,
  counterPartyAddress: string,
): ViewerTrustlineBalance {
  const projected = viewerBalance(row, viewerAddress, counterPartyAddress);
  const direction = directionOf(projected.balance);
  return {
    counterPartyAddress,
    balance: projected.balance,
    received: projected.creditlineReceived,
    given: projected.creditlineGiven,
    direction,
    availableCapacity: availableCapacityOf(direction, projected.creditlineReceived, projected.balance),
  };
}

/** Resolves a trustline row's counterparty from either casing the protocol emits. */
export function trustlineCounterParty(row: TrustlineRow): string | null {
  return row.counterPartyAddress ?? row.counter_party_address ?? null;
}

/**
 * Pure single-pair selection over a viewer-balance map. Returns the trustline
 * for `counterPartyAddress`, or null when the pair has no trustline yet (EC-2).
 * A null result is a valid "no trustline" state, not an error.
 */
export function selectViewerTrustline(
  balances: Map<string, ViewerTrustlineBalance>,
  counterPartyAddress: string,
): ViewerTrustlineBalance | null {
  return balances.get(counterPartyAddress) ?? null;
}

/** Pure narrowing of one untyped ledger event; returns null when required fields are absent. */
export function narrowTrustlineEvent(value: unknown): TrustlineEvent | null {
  if (typeof value !== 'object' || value === null) return null;
  const event = value as Record<string, unknown>;
  const idOk = typeof event.id === 'string' || typeof event.id === 'number';
  const amountOk = typeof event.amount === 'string' || typeof event.amount === 'number';
  const createdOk = typeof event.created_at === 'string';
  if (!idOk || !amountOk || !createdOk) return null;
  return event as TrustlineEvent;
}
