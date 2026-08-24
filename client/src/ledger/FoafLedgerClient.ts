import type {
  FoafCapacityResult,
  FoafConfirmResult,
  FoafKeypair,
  FoafLedgerClientOptions,
  FoafMutationResult,
  FoafNetwork,
  FoafPendingTransfer,
  TrustlineRow,
} from './types';

export class FoafLedgerClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly signatureProvider?: FoafLedgerClientOptions['signatureProvider'];

  constructor(options: FoafLedgerClientOptions | string) {
    const resolved = typeof options === 'string' ? { baseUrl: options } : options;
    this.baseUrl = resolved.baseUrl.replace(/\/$/, '');
    this.fetcher = (resolved.fetch ?? globalThis.fetch).bind(globalThis);
    this.signatureProvider = resolved.signatureProvider;
  }

  async createKeypair(): Promise<FoafKeypair> {
    return this.read('/api/v1/keypair', { method: 'POST', body: '{}' });
  }

  async networks(): Promise<FoafNetwork[]> {
    return this.read('/api/v1/networks');
  }

  async getNetwork(networkAddress: string): Promise<FoafNetwork> {
    return this.read(`/api/v1/networks/${encodeURIComponent(networkAddress)}`);
  }

  async userTrustlines(networkAddress: string, userAddress: string): Promise<TrustlineRow[]> {
    return this.read(
      `/api/v1/networks/${encodeURIComponent(networkAddress)}/users/${encodeURIComponent(userAddress)}/trustlines`,
    );
  }

  async updateTrustline(params: {
    networkAddress: string;
    creditorAddress: string;
    debtorAddress: string;
    creditlineGiven: string;
    creditlineReceived: string;
  }): Promise<FoafMutationResult<unknown>> {
    const body = JSON.stringify({
      creditor_address: params.creditorAddress,
      debtor_address: params.debtorAddress,
      creditline_given: params.creditlineGiven,
      creditline_received: params.creditlineReceived,
    });
    return this.mutate(
      `/api/v1/networks/${encodeURIComponent(params.networkAddress)}/trustlines/update`,
      await this.signedRequest('POST', body, params.creditorAddress),
    );
  }

  async maxCapacityPathInfo(
    networkAddress: string,
    fromAddress: string,
    toAddress: string,
  ): Promise<FoafCapacityResult> {
    const body = JSON.stringify({
      address: networkAddress,
      from: fromAddress,
      to: toAddress,
    });
    return this.read(
      `/api/v1/networks/${encodeURIComponent(networkAddress)}/max-capacity-path-info`,
      { method: 'POST', headers: this.jsonHeaders(), body },
    );
  }

  async createPendingTransfer(params: {
    networkAddress: string;
    fromAddress: string;
    toAddress: string;
    value: string;
    extraData?: unknown;
    maxFee?: string;
    feePayer?: string;
    path?: string[];
    idempotencyKey?: string;
  }): Promise<FoafMutationResult<FoafPendingTransfer>> {
    const payload: Record<string, unknown> = {
      network_address: params.networkAddress,
      from_address: params.fromAddress,
      to_address: params.toAddress,
      value: params.value,
      extra_data: params.extraData ?? null,
    };
    if (params.maxFee !== undefined) payload.max_fee = params.maxFee;
    if (params.feePayer !== undefined) payload.fee_payer = params.feePayer;
    if (params.path !== undefined) payload.path = params.path;
    if (params.idempotencyKey !== undefined) payload.idempotency_key = params.idempotencyKey;
    const body = JSON.stringify(payload);
    return this.mutate(
      '/api/v1/pending_transfers',
      await this.signedRequest('POST', body, params.fromAddress),
    );
  }

  async pendingTransfer(
    pendingTransferId: string,
  ): Promise<FoafMutationResult<FoafPendingTransfer>> {
    return this.mutate(
      `/api/v1/pending_transfers/${encodeURIComponent(pendingTransferId)}`,
      { method: 'GET', headers: this.jsonHeaders() },
    );
  }

  async pendingTransferByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<FoafMutationResult<FoafPendingTransfer>> {
    return this.mutate(
      this.withQuery(
        '/api/v1/pending_transfers/by_idempotency_key',
        { idempotency_key: idempotencyKey },
      ),
      { method: 'GET', headers: this.jsonHeaders() },
    );
  }

  async confirmTransfer(
    pendingTransferId: string,
    signerAddress?: string,
  ): Promise<FoafMutationResult<FoafConfirmResult>> {
    const body = '{}';
    return this.mutate(
      `/api/v1/pending_transfers/${encodeURIComponent(pendingTransferId)}/confirm`,
      await this.signedRequest('PUT', body, signerAddress),
    );
  }

  async rejectTransfer(
    pendingTransferId: string,
    signerAddress?: string,
    reason?: string,
  ): Promise<FoafMutationResult<FoafPendingTransfer>> {
    const body = JSON.stringify(reason === undefined ? {} : { reason });
    return this.mutate(
      `/api/v1/pending_transfers/${encodeURIComponent(pendingTransferId)}/reject`,
      await this.signedRequest('PUT', body, signerAddress),
    );
  }

  async userEvents(networkAddress: string, userAddress: string, type?: string): Promise<unknown[]> {
    return this.read(this.withQuery(
      `/api/v1/networks/${encodeURIComponent(networkAddress)}/users/${encodeURIComponent(userAddress)}/events`,
      { type },
    ));
  }

  async trustlineEvents(
    networkAddress: string,
    userAddress: string,
    counterPartyAddress: string,
    type?: string,
  ): Promise<unknown[]> {
    return this.read(this.withQuery(
      `/api/v1/networks/${encodeURIComponent(networkAddress)}/users/${encodeURIComponent(userAddress)}/trustlines/${encodeURIComponent(counterPartyAddress)}/events`,
      { type },
    ));
  }

  async operations(
    networkAddress: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<unknown[]> {
    return this.read(this.withQuery(
      `/api/v1/networks/${encodeURIComponent(networkAddress)}/operations`,
      { limit: params.limit ?? 20, ...params },
    ));
  }

  async operation(operationId: string): Promise<unknown> {
    return this.read(`/api/v1/operations/${encodeURIComponent(operationId)}`);
  }

  private async read<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, init);
    if (!response.ok) {
      throw new Error(`FOAF request failed: ${response.status} — ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  }

  private async mutate<T>(path: string, init: RequestInit): Promise<FoafMutationResult<T>> {
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, init);
      const raw = await response.text();
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          body: raw,
          outcome: response.status >= 400 && response.status < 500
            ? 'rejected'
            : 'ambiguous',
          error: raw,
        };
      }
      try {
        return {
          ok: true,
          status: response.status,
          body: raw,
          outcome: 'success',
          data: JSON.parse(raw) as T,
        };
      } catch {
        return {
          ok: false,
          status: response.status,
          body: raw,
          outcome: 'ambiguous',
          error: 'FOAF returned a successful status with an invalid JSON body',
        };
      }
    } catch (error) {
      return {
        ok: false,
        status: 0,
        body: null,
        outcome: 'ambiguous',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async signedRequest(
    method: string,
    body: string,
    signerAddress?: string,
  ): Promise<RequestInit> {
    const headers = this.jsonHeaders();
    if (signerAddress && this.signatureProvider) {
      const signature = await this.signatureProvider(signerAddress, body);
      if (signature) headers['X-Signature'] = signature;
    }
    return { method, headers, body };
  }

  private jsonHeaders(): Record<string, string> {
    return { Accept: 'application/json', 'Content-Type': 'application/json' };
  }

  private withQuery(
    path: string,
    params: Record<string, string | number | undefined>,
  ): string {
    const query = Object.entries(params)
      .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
    return query ? `${path}?${query}` : path;
  }
}
