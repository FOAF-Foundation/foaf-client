import { useCallback, useEffect, useState } from 'react';
import type { FoafContactsClient } from '../../contacts/FoafContactsClient';
import { projectContact, type FoafContact } from './types';

export interface UseContactsResult {
  contacts: FoafContact[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Lists the viewer's contacts and projects each canonical edge into a
 * {@link FoafContact}. Unconfirmed contacts (null `foaf_address`) are kept in the
 * list with `hasWallet: false`; screens decide how to present them.
 */
export function useContacts(client: FoafContactsClient): UseContactsResult {
  const [contacts, setContacts] = useState<FoafContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    client
      .list()
      .then((edges) => {
        if (!active) return;
        setContacts(edges.map(projectContact));
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
  }, [client, nonce]);

  return { contacts, loading, error, refetch };
}
