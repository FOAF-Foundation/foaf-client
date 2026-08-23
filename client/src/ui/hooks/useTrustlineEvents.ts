import { useEffect, useState } from 'react';
import type { FoafLedgerClient } from '../../ledger/FoafLedgerClient';
import { narrowTrustlineEvent, type TrustlineEvent } from './types';

export interface UseTrustlineEventsResult {
  events: TrustlineEvent[];
  loading: boolean;
  error: Error | null;
}

/**
 * Fetches the event log for one trustline (viewer ↔ counterparty) and narrows
 * each untyped element to a {@link TrustlineEvent}, dropping any that lack the
 * required fields. Events are returned in delivery order; display ordering is
 * the UI's job.
 */
export function useTrustlineEvents(
  ledger: FoafLedgerClient,
  viewerAddress: string,
  counterPartyAddress: string,
  networkAddress: string,
): UseTrustlineEventsResult {
  const [events, setEvents] = useState<TrustlineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    ledger
      .trustlineEvents(networkAddress, viewerAddress, counterPartyAddress)
      .then((raw) => {
        if (!active) return;
        const narrowed: TrustlineEvent[] = [];
        for (const item of raw) {
          const event = narrowTrustlineEvent(item);
          if (event) narrowed.push(event);
        }
        setEvents(narrowed);
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
  }, [ledger, viewerAddress, counterPartyAddress, networkAddress]);

  return { events, loading, error };
}
