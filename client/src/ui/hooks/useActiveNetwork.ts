import { useEffect, useState } from 'react';
import type { FoafLedgerClient } from '../../ledger/FoafLedgerClient';
import { NoFoafNetworkError, resolveActiveNetwork } from './types';

export interface UseActiveNetworkResult {
  network: string | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Resolves the tier's active FOAF network address (the first network the ledger
 * exposes). Never throws: an empty network list or a fetch failure surfaces as
 * `error` while `network` stays null.
 */
export function useActiveNetwork(ledger: FoafLedgerClient): UseActiveNetworkResult {
  const [network, setNetwork] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    ledger
      .networks()
      .then((networks) => {
        if (!active) return;
        const resolved = resolveActiveNetwork(networks);
        if (resolved instanceof NoFoafNetworkError) {
          setError(resolved);
          setNetwork(null);
        } else {
          setNetwork(resolved);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setNetwork(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ledger]);

  return { network, loading, error };
}
