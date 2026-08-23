import type { FoafLedgerClient } from '../../ledger/FoafLedgerClient';
import { useTrustlineBalances } from './useTrustlineBalances';
import { selectViewerTrustline, type ViewerTrustlineBalance } from './types';

export interface UseViewerTrustlineResult {
  trustline: ViewerTrustlineBalance | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Single-pair view derived from {@link useTrustlineBalances}. Returns the
 * viewer's trustline with `counterPartyAddress`, or null when no trustline
 * exists yet for that pair. A null trustline is not an error.
 */
export function useViewerTrustline(
  ledger: FoafLedgerClient,
  viewerAddress: string,
  counterPartyAddress: string,
  networkAddress: string,
): UseViewerTrustlineResult {
  const { balances, loading, error } = useTrustlineBalances(ledger, viewerAddress, networkAddress);
  return {
    trustline: selectViewerTrustline(balances, counterPartyAddress),
    loading,
    error,
  };
}
