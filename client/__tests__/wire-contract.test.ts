import { recoverPublicKey } from '@noble/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  signPayload,
  addressFromPrivateKey,
  personalMessageHash,
} from '../src/ledger/signer';

// Pins the custodian-sign -> FOAF verify_by_address round-trip against the
// shared wire-contract fixture. FOAF's SignatureVerifier.verify_by_address does
// NOT compare recovered pubkey == address; it recovers the pubkey, DERIVES the
// address (keccak256(pubkey[1:])[-20:]), then compares ADDRESSES. This test
// mirrors that two-step derivation, so a Ruby/TS signer drift is caught here.
describe('wire-contract fixture: TS signer matches verify_by_address', () => {
  const fixture = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../contracts/wire-contract-fixture.json'),
      'utf8',
    ),
  ) as {
    private_key_hex: string;
    signer_address: string;
    payload: string;
    expected_signature: string;
  };

  it('signs the fixture payload and derives the fixture signer_address', () => {
    const signature = signPayload(fixture.private_key_hex, fixture.payload);
    const compact = signature.slice(2, 130);
    const recovery = Number.parseInt(signature.slice(130), 16) - 27;

    const publicKey = recoverPublicKey(
      personalMessageHash(fixture.payload),
      compact,
      recovery,
      false,
    );
    const digest = keccak_256(publicKey.slice(1));
    const recoveredAddress = `0x${bytesToHex(digest.slice(-20))}`;

    expect(recoveredAddress.toLowerCase()).toBe(fixture.signer_address.toLowerCase());
  });

  it('derives the fixture signer_address directly from the private key', () => {
    expect(addressFromPrivateKey(fixture.private_key_hex).toLowerCase()).toBe(
      fixture.signer_address.toLowerCase(),
    );
  });
});
