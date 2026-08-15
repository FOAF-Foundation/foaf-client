// Resolves a counterparty's canonical foaf_address from auth's
// foaf_id → foaf_address binding (B2). The address is always the one auth
// holds, never a client-supplied value, so a payment can never be routed to an
// attacker-chosen wallet.
//
// Returns the address on 200, null on 404 (the identity has no wallet yet),
// and throws on a 5xx or a network failure (EC 5 — a lookup failure is never
// silently downgraded to "no address").
export async function resolveFoafAddress(
  fetchFn: typeof globalThis.fetch,
  baseUrl: string,
  serviceToken: string,
  foafId: string,
): Promise<string | null> {
  const url =
    `${baseUrl.replace(/\/$/, '')}` +
    `/v1/internal/identities/${encodeURIComponent(foafId)}/foaf_address`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${serviceToken}`,
      },
    });
  } catch (err) {
    throw new Error(
      `FOAF address lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `FOAF address lookup failed: ${response.status} — ${await response.text()}`,
    );
  }

  const data = (await response.json()) as { foaf_address?: string | null };
  return data.foaf_address ?? null;
}
