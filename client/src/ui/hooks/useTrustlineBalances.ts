import { useEffect, useState } from 'react';
import type { FoafLedgerClient } from '../../ledger/FoafLedgerClient';
import {
  buildViewerTrustlineBalance,
  trustlineCounterParty,
  type ViewerTrustlineBalance,
} from './types';

export interface UseTrustlineBalancesResult {
  balances: Map<string, ViewerTrustlineBalance>;
  loading: boolean;
  error: Error | null;
}

/**
 * Fetches the viewer's trustlines on a given network and projects each into a
 * viewer-oriented {@link ViewerTrustlineBalance}, keyed by counterparty address.
 * `networkAddress` is a parameter (screens resolve it via `useActiveNetwork`
 * first); this hook does not call `networks()` itself.
 */
export function useTrustlineBalances(
  ledger: FoafLedgerClient,
  viewerAddress: string,
  networkAddress: string,
): UseTrustlineBalancesResult {
  const [balances, setBalances] = useState<Map<string, ViewerTrustlineBalance>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    ledger
      .userTrustlines(networkAddress, viewerAddress)
      .then((rows) => {
        if (!active) return;
        const next = new Map<string, ViewerTrustlineBalance>();
        for (const row of rows) {
          const counterPartyAddress = trustlineCounterParty(row);
          if (!counterPartyAddress) continue;
          next.set(
            counterPartyAddress,
            buildViewerTrustlineBalance(row, viewerAddress, counterPartyAddress),
          );
        }
        setBalances(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ledger, viewerAddress, networkAddress]);

  return { balances, loading, error };
}
