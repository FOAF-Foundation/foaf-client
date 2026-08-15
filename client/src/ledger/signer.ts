import {
  getPublicKey,
  signSync,
  utils as secpUtils,
} from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { keccak_256 } from '@noble/hashes/sha3';
import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  utf8ToBytes,
} from '@noble/hashes/utils';
import type { FoafSignatureProvider } from './types';

if (!secpUtils.hmacSha256Sync) {
  secpUtils.hmacSha256Sync = (key, ...messages) =>
    hmac(sha256, key, concatBytes(...messages));
}

function privateKeyBytes(privateKey: string): Uint8Array {
  return hexToBytes(privateKey.replace(/^0x/, ''));
}

export function personalMessageHash(payload: string): Uint8Array {
  const message = utf8ToBytes(payload);
  const prefix = utf8ToBytes(`\u0019Ethereum Signed Message:\n${message.length}`);
  return keccak_256(concatBytes(prefix, message));
}

/** Ethereum personal_sign wire format: 32-byte r + 32-byte s + recovery v. */
export function signPayload(privateKey: string, payload: string): string {
  const [signature, recovery] = signSync(
    personalMessageHash(payload),
    privateKeyBytes(privateKey),
    { canonical: true, der: false, recovered: true },
  );
  return `0x${bytesToHex(concatBytes(signature, Uint8Array.of(27 + recovery)))}`;
}

export function addressFromPrivateKey(privateKey: string): string {
  const publicKey = getPublicKey(privateKeyBytes(privateKey), false);
  const digest = keccak_256(publicKey.slice(1));
  return `0x${bytesToHex(digest.slice(-20))}`;
}

export function createPrivateKeySignatureProvider(
  getPrivateKey: (address: string) => Promise<string | null> | string | null,
) {
  return async (address: string, payload: string): Promise<string | null> => {
    const privateKey = await getPrivateKey(address);
    if (!privateKey) return null;
    if (addressFromPrivateKey(privateKey).toLowerCase() !== address.toLowerCase()) {
      throw new Error('FOAF private key does not match the requested signer address');
    }
    return signPayload(privateKey, payload);
  };
}

/**
 * Signature provider that routes signing to the shared FOAF custodian over
 * HTTPS instead of holding a local private key. Drop-in replacement for
 * `createPrivateKeySignatureProvider` — same `FoafSignatureProvider` shape, so
 * the app-level ledger API is unchanged (FR 13).
 *
 * The custodian resolves the key from `foafId` (one address per identity), so
 * the requested signer address is ignored. The exact body is forwarded verbatim
 * so the custodian signs the same bytes that go on the wire.
 *
 * EC 5: a network failure or a 5xx throws — there is NO local-key fallback.
 * Only an explicit "no key" 404 returns null (distinct from a server failure),
 * mirroring the local provider's null-when-no-key contract.
 */
export function createRemoteCustodianSignatureProvider(
  fetchFn: typeof globalThis.fetch,
  baseUrl: string,
  serviceToken: string,
  foafId: string,
): FoafSignatureProvider {
  const signUrl = `${baseUrl.replace(/\/$/, '')}/v1/internal/custodian/sign`;
  return async (_address: string, exactBody: string): Promise<string | null> => {
    let response: Response;
    try {
      response = await fetchFn(signUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceToken}`,
        },
        body: JSON.stringify({ foaf_id: foafId, exact_body: exactBody }),
      });
    } catch (err) {
      throw new Error(
        `FOAF custodian unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(
        `FOAF custodian sign failed: ${response.status} — ${await response.text()}`,
      );
    }

    const data = (await response.json()) as { signature?: string };
    if (!data.signature) {
      throw new Error('FOAF custodian sign returned no signature');
    }
    return data.signature;
  };
}
