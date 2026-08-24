import type { TrustlineRow, ViewerBalance } from './types';

function decimal(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  return '0';
}

/**
 * Projects a per-viewer `userTrustlines` row into the viewer's perspective.
 *
 * These rows are ALREADY viewer-oriented: the network's per-user endpoint has
 * applied the viewer's frame before it hits the client. So there is NO sign or
 * limit flip here — `balance` is already the viewer's balance (negative = the
 * viewer owes, positive = the counterparty owes the viewer), `received` is the
 * viewer's credit limit, and `given` is the counterparty's. This mirrors the
 * gem's `Foaf::Balances.from_user_trustline_row` (also no negation).
 *
 * Contrast the RAW creditor-oriented `/trustlines` endpoint, where the balance
 * IS creditor-view and must be negated for the debtor — that conversion lives
 * in the gem's `from_trustline_row` (`viewer_balance = -balance`) and does not
 * apply here.
 *
 * The `viewerAddress`/`counterPartyAddress` params are kept for signature
 * stability (callers still identify the pair); they no longer drive a flip.
 * Wire keys (`given`/`received`) are primary; the write-side `creditline*`
 * names remain tolerant fallbacks. Strings are retained so applications do not
 * lose decimal precision.
 */
export function viewerBalance(
  row: TrustlineRow,
  _viewerAddress: string,
  _counterPartyAddress: string,
): ViewerBalance {
  const balance = decimal(row.balance);
  const given = decimal(row.given ?? row.creditlineGiven ?? row.creditline_given);
  const received = decimal(row.received ?? row.creditlineReceived ?? row.creditline_received);
  return {
    balance: balance === '-0' ? '0' : balance,
    creditlineGiven: given,
    creditlineReceived: received,
  };
}
