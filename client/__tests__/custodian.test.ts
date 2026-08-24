import {
  createRemoteCustodianSignatureProvider,
  createSessionSignatureProvider,
} from '../src/ledger';
import { resolveFoafAddress } from '../src/auth';

function response(status: number, body: unknown): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text),
    text: async () => text,
  } as Response;
}

const baseUrl = 'https://auth.foaf.test';
const serviceToken = 'svc-token-123';
const foafId = 'identity-42';

describe('createRemoteCustodianSignatureProvider', () => {
  it('posts to the sign endpoint with the Bearer token and returns the signature', async () => {
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(200, { signature: '0xsig' }),
    );
    const provider = createRemoteCustodianSignatureProvider(
      fetcher as unknown as typeof fetch,
      baseUrl,
      serviceToken,
      foafId,
    );

    const signature = await provider('0xsigner', '{"value":"5"}');

    expect(signature).toBe('0xsig');
    expect(fetcher.mock.calls[0][0]).toBe(
      `${baseUrl}/v1/internal/custodian/sign`,
    );
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${serviceToken}`,
    );
    expect(JSON.parse(init.body as string)).toEqual({
      foaf_id: foafId,
      exact_body: '{"value":"5"}',
    });
  });

  it('throws on a 5xx — no null return for a server failure (EC 5)', async () => {
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(503, 'custodian down'),
    );
    const provider = createRemoteCustodianSignatureProvider(
      fetcher as unknown as typeof fetch,
      baseUrl,
      serviceToken,
      foafId,
    );

    await expect(provider('0xsigner', 'body')).rejects.toThrow(/503/);
  });

  it('throws on a network failure — never falls back to a local key (EC 5)', async () => {
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
        throw new Error('network down');
      },
    );
    const provider = createRemoteCustodianSignatureProvider(
      fetcher as unknown as typeof fetch,
      baseUrl,
      serviceToken,
      foafId,
    );

    await expect(provider('0xsigner', 'body')).rejects.toThrow(/unreachable/);
  });

  it('returns null only for an explicit "no key" 404 (distinct from a failure)', async () => {
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(404, { error: 'no key' }),
    );
    const provider = createRemoteCustodianSignatureProvider(
      fetcher as unknown as typeof fetch,
      baseUrl,
      serviceToken,
      foafId,
    );

    await expect(provider('0xsigner', 'body')).resolves.toBeNull();
  });
});

describe('createSessionSignatureProvider', () => {
  const sessionToken = 'session-jwt-abc';

  it('posts to sign_for_self with the Bearer token and returns the signature', async () => {
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(200, { signature: '0xsig' }),
    );
    const provider = createSessionSignatureProvider(
      fetcher as unknown as typeof fetch,
      baseUrl,
      async () => sessionToken,
    );

    const signature = await provider('0xsigner', '{"value":"5"}');

    expect(signature).toBe('0xsig');
  });

  it('sends the Authorization header as Bearer <token>', async () => {
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(200, { signature: '0xsig' }),
    );
    const provider = createSessionSignatureProvider(
      fetcher as unknown as typeof fetch,
      baseUrl,
      async () => sessionToken,
    );

    await provider('0xsigner', '{"value":"5"}');

    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${sessionToken}`,
    );
  });

  it('sends only { exact_body } — no foaf_id and no signer-selection field', async () => {
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(200, { signature: '0xsig' }),
    );
    const provider = createSessionSignatureProvider(
      fetcher as unknown as typeof fetch,
      baseUrl,
      async () => sessionToken,
    );

    await provider('0xsigner', '{"value":"5"}');

    const init = fetcher.mock.calls[0][1] as RequestInit;
    const parsed = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(parsed).toEqual({ exact_body: '{"value":"5"}' });
    expect(parsed).not.toHaveProperty('foaf_id');
    expect(parsed).not.toHaveProperty('signer_address');
    expect(parsed).not.toHaveProperty('address');
  });

  it('posts to exactly <baseUrl>/v1/custodian/sign_for_self', async () => {
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(200, { signature: '0xsig' }),
    );
    const provider = createSessionSignatureProvider(
      fetcher as unknown as typeof fetch,
      baseUrl,
      async () => sessionToken,
    );

    await provider('0xsigner', 'body');

    expect(fetcher.mock.calls[0][0]).toBe(`${baseUrl}/v1/custodian/sign_for_self`);
  });

  it('returns null only for an explicit 404 (distinct from a server failure)', async () => {
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(404, { error: 'no wallet' }),
    );
    const provider = createSessionSignatureProvider(
      fetcher as unknown as typeof fetch,
      baseUrl,
      async () => sessionToken,
    );

    await expect(provider('0xsigner', 'body')).resolves.toBeNull();
  });

  it('throws on a 5xx — no null return for a server failure (EC 5)', async () => {
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(503, 'custodian down'),
    );
    const provider = createSessionSignatureProvider(
      fetcher as unknown as typeof fetch,
      baseUrl,
      async () => sessionToken,
    );

    await expect(provider('0xsigner', 'body')).rejects.toThrow(/503/);
  });

  it('throws on a network failure — never falls back to a local key (EC 5)', async () => {
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
        throw new Error('network down');
      },
    );
    const provider = createSessionSignatureProvider(
      fetcher as unknown as typeof fetch,
      baseUrl,
      async () => sessionToken,
    );

    await expect(provider('0xsigner', 'body')).rejects.toThrow(/unreachable/);
  });

  it('throws when no session token is available (no-token case)', async () => {
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(200, { signature: '0xsig' }),
    );
    const provider = createSessionSignatureProvider(
      fetcher as unknown as typeof fetch,
      baseUrl,
      async () => null,
    );

    await expect(provider('0xsigner', 'body')).rejects.toThrow(/no token/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('resolveFoafAddress', () => {
  it('returns the address on 200', async () => {
    const address = '0x00000000000000000000000000000000000000ab';
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(200, { foaf_address: address }),
    );

    const result = await resolveFoafAddress(
      fetcher as unknown as typeof fetch,
      baseUrl,
      serviceToken,
      foafId,
    );

    expect(result).toBe(address);
    expect(fetcher.mock.calls[0][0]).toBe(
      `${baseUrl}/v1/internal/identities/${foafId}/foaf_address`,
    );
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${serviceToken}`,
    );
  });

  it('returns null on 404 (no wallet yet)', async () => {
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(404, { error: 'none' }),
    );

    const result = await resolveFoafAddress(
      fetcher as unknown as typeof fetch,
      baseUrl,
      serviceToken,
      foafId,
    );

    expect(result).toBeNull();
  });

  it('throws on a 5xx — never returns null for a server failure (EC 5)', async () => {
    const fetcher = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response(500, 'boom'),
    );

    await expect(
      resolveFoafAddress(
        fetcher as unknown as typeof fetch,
        baseUrl,
        serviceToken,
        foafId,
      ),
    ).rejects.toThrow(/500/);
  });
});
