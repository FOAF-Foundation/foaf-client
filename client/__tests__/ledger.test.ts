import { recoverPublicKey } from '@noble/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  addressFromPrivateKey,
  createKeypairStore,
  FoafLedgerClient,
  personalMessageHash,
  signPayload,
  viewerBalance,
} from '../src/ledger';

function response(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text),
    text: async () => text,
  } as Response;
}

describe('FoafLedgerClient', () => {
  it('sends the address workaround in max-capacity requests', async () => {
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(200, { capacity: '12', path: [] }),
    );
    const client = new FoafLedgerClient({
      baseUrl: 'https://foaf.test',
      fetch: fetcher as unknown as typeof fetch,
    });
    await client.maxCapacityPathInfo('network', 'sender', 'receiver');
    const fixture = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../contracts/max-capacity-path-info.request.json'),
        'utf8',
      ),
    ) as Record<string, string>;

    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toEqual({
      ...fixture,
      address: 'network',
      from: 'sender',
      to: 'receiver',
    });
  });

  it('signs the exact serialized transfer body and preserves failures', async () => {
    const signed: string[] = [];
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(422, '{"error":"InsufficientCapacity"}'),
    );
    const client = new FoafLedgerClient({
      baseUrl: 'https://foaf.test',
      fetch: fetcher as unknown as typeof fetch,
      signatureProvider: (_address, body) => {
        signed.push(body);
        return '0xsigned';
      },
    });
    const result = await client.createPendingTransfer({
      networkAddress: 'network',
      fromAddress: 'sender',
      toAddress: 'receiver',
      value: '6.80',
      idempotencyKey: 'client:payment:42',
    });
    const init = fetcher.mock.calls[0][1] as RequestInit;

    expect(signed).toEqual([init.body]);
    expect((init.headers as Record<string, string>)['X-Signature']).toBe('0xsigned');
    expect(JSON.parse(init.body as string).idempotency_key).toBe('client:payment:42');
    expect(result).toEqual({
      ok: false,
      status: 422,
      body: '{"error":"InsufficientCapacity"}',
      outcome: 'rejected',
      error: '{"error":"InsufficientCapacity"}',
    });
  });

  it('preserves status and raw body for successful mutations', async () => {
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(201, { id: 'pending-1', status: 'pending' }),
    );
    const client = new FoafLedgerClient({
      baseUrl: 'https://foaf.test',
      fetch: fetcher as unknown as typeof fetch,
    });

    await expect(client.createPendingTransfer({
      networkAddress: 'network',
      fromAddress: 'sender',
      toAddress: 'receiver',
      value: '1',
      idempotencyKey: 'client:payment:43',
    })).resolves.toEqual({
      ok: true,
      status: 201,
      body: '{"id":"pending-1","status":"pending"}',
      outcome: 'success',
      data: { id: 'pending-1', status: 'pending' },
    });
  });

  it('signs confirm and reject wire bytes as the receiver', async () => {
    const signed: Array<[string, string]> = [];
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(200, { id: 'pending-1', status: 'confirmed', operation: 9 }),
    );
    const client = new FoafLedgerClient({
      baseUrl: 'https://foaf.test',
      fetch: fetcher as unknown as typeof fetch,
      signatureProvider: (address, body) => {
        signed.push([address, body]);
        return '0xsigned';
      },
    });

    await client.confirmTransfer('pending-1', 'receiver');
    await client.rejectTransfer('pending-2', 'receiver', 'declined');

    expect(signed).toEqual([
      ['receiver', '{}'],
      ['receiver', '{"reason":"declined"}'],
    ]);
    expect(signed[0][1]).toBe(fetcher.mock.calls[0][1]?.body);
    expect(signed[1][1]).toBe(fetcher.mock.calls[1][1]?.body);
  });

  it('uses strict status/body results for pending-transfer reconciliation reads', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(response(404, '{"error":"not found"}'))
      .mockResolvedValueOnce(response(200, {
        id: 'pending-1',
        idempotencyKey: 'client:payment:44',
        status: 'confirmed',
        operation: 12,
      }));
    const client = new FoafLedgerClient({
      baseUrl: 'https://foaf.test',
      fetch: fetcher as unknown as typeof fetch,
    });

    await expect(
      client.pendingTransferByIdempotencyKey('client:payment:44'),
    ).resolves.toMatchObject({
      ok: false,
      status: 404,
      outcome: 'rejected',
      body: '{"error":"not found"}',
    });
    await expect(client.pendingTransfer('pending-1')).resolves.toMatchObject({
      ok: true,
      status: 200,
      outcome: 'success',
      data: { status: 'confirmed', operation: 12 },
    });
    expect(fetcher.mock.calls[0][0]).toContain(
      'idempotency_key=client%3Apayment%3A44',
    );
  });

  it('binds the global fetch fallback so a browser-context call does not throw Illegal invocation', async () => {
    // In a real browser, globalThis.fetch must run with `this === window`; a
    // detached reference (`this.fetcher = globalThis.fetch`) invoked as a method
    // runs with `this` set to the client instance and throws
    // "TypeError: Illegal invocation". jest.fn() alone can't reproduce that (a
    // plain mock ignores its receiver), so this mock replicates the native
    // receiver check: it throws unless invoked with `this === globalThis`. The
    // constructor's `.bind(globalThis)` is exactly what keeps that true.
    const original = globalThis.fetch;
    let receiverCalls = 0;
    function boundOnlyFetch(
      this: unknown,
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ): Promise<Response> {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }
      receiverCalls += 1;
      return Promise.resolve(response(200, [{ address: 'network' }]));
    }
    (globalThis as { fetch: typeof fetch }).fetch =
      boundOnlyFetch as unknown as typeof fetch;
    try {
      // No `fetch` option → the client falls back to globalThis.fetch, the
      // exact capture that must be bound.
      const client = new FoafLedgerClient({ baseUrl: 'https://foaf.test' });
      await expect(client.networks()).resolves.toEqual([{ address: 'network' }]);
      expect(receiverCalls).toBe(1);
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = original;
    }
  });

  it('classifies transport errors as ambiguous without losing the error', async () => {
    const fetcher = jest.fn(async () => {
      throw new Error('network timeout');
    });
    const client = new FoafLedgerClient({
      baseUrl: 'https://foaf.test',
      fetch: fetcher as unknown as typeof fetch,
    });

    await expect(client.confirmTransfer('pending-1', 'receiver')).resolves.toEqual({
      ok: false,
      status: 0,
      body: null,
      outcome: 'ambiguous',
      error: 'network timeout',
    });
  });
});

describe('ledger cryptography and custody', () => {
  const privateKey = '0x59c6995e998f97a5a0044976f0945389dc9e86dae88c7a8412f4603b6b78690d';

  it('emits a recoverable Ethereum personal_sign signature', () => {
    const payload = '{"value":"6.80"}';
    const signature = signPayload(privateKey, payload);
    const compact = signature.slice(2, 130);
    const recovery = Number.parseInt(signature.slice(130), 16) - 27;
    const publicKey = recoverPublicKey(personalMessageHash(payload), compact, recovery, false);
    const digest = keccak_256(publicKey.slice(1));

    expect(`0x${bytesToHex(digest.slice(-20))}`).toBe(addressFromPrivateKey(privateKey));
    expect(signature).toHaveLength(132);
  });

  it('stores and clears keypairs through an injected adapter', async () => {
    const values = new Map<string, string>();
    const store = createKeypairStore({
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => void values.set(key, value),
      removeItem: async (key) => void values.delete(key),
    });
    const keypair = {
      address: addressFromPrivateKey(privateKey),
      publicKey: 'public',
      privateKey,
    };
    await store.set(keypair);
    expect(await store.get()).toEqual(keypair);
    await store.clear();
    expect(await store.get()).toBeNull();
  });

  it('flips a trustline into the counterparty perspective', () => {
    expect(
      viewerBalance(
        { balance: '8.50', creditline_given: '40', creditline_received: '25' },
        '0xviewer',
        '0xowner',
      ),
    ).toEqual({
      balance: '-8.50',
      creditlineGiven: '25',
      creditlineReceived: '40',
    });
  });
});
