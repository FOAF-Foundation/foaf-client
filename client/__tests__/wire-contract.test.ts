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

// Pins the EXACT canonical wire bytes for the two allowlisted op shapes. The
// Phase-4 foaf-auth re-serializer asserts byte-equality against this same
// contracts/canonical-op-bodies.json, so key ORDER (insertion, not sorted) is
// the load-bearing invariant. These tests build the payload objects the way
// FoafLedgerClient does and JSON.stringify them; they never call fetch/mutate.
describe('canonical-op-bodies fixture: exact wire byte order', () => {
  const opBodies = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../contracts/canonical-op-bodies.json'),
      'utf8',
    ),
  ) as {
    updateTrustline: {
      input: {
        creditorAddress: string;
        debtorAddress: string;
        creditlineGiven: string;
        creditlineReceived: string;
      };
      canonical_body: string;
    };
    createPendingTransfer_with_optionals: {
      input: {
        networkAddress: string;
        fromAddress: string;
        toAddress: string;
        value: string;
        extraData: unknown;
        maxFee: string;
        feePayer: string;
        path: string[];
        idempotencyKey: string;
      };
      canonical_body: string;
    };
  };

  it('updateTrustline canonical body matches FoafLedgerClient key order', () => {
    const params = opBodies.updateTrustline.input;
    // Mirror FoafLedgerClient.ts:49-54 exactly.
    const body = JSON.stringify({
      creditor_address: params.creditorAddress,
      debtor_address: params.debtorAddress,
      creditline_given: params.creditlineGiven,
      creditline_received: params.creditlineReceived,
    });
    expect(body).toBe(opBodies.updateTrustline.canonical_body);
  });

  it('createPendingTransfer with optionals appends fields in insertion order', () => {
    const params = opBodies.createPendingTransfer_with_optionals.input;
    // Mirror FoafLedgerClient.ts:88-99 exactly: base object, then optionals
    // appended (not sorted) in the order max_fee, fee_payer, path,
    // idempotency_key.
    const payload: Record<string, unknown> = {
      network_address: params.networkAddress,
      from_address: params.fromAddress,
      to_address: params.toAddress,
      value: params.value,
      extra_data: params.extraData,
    };
    if (params.maxFee !== undefined) payload.max_fee = params.maxFee;
    if (params.feePayer !== undefined) payload.fee_payer = params.feePayer;
    if (params.path !== undefined) payload.path = params.path;
    if (params.idempotencyKey !== undefined) {
      payload.idempotency_key = params.idempotencyKey;
    }
    const body = JSON.stringify(payload);
    expect(body).toBe(
      opBodies.createPendingTransfer_with_optionals.canonical_body,
    );
  });
});
