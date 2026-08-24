export interface FoafNetwork {
  address: string;
  decimals: number;
  name: string;
  [key: string]: unknown;
}

export interface FoafCapacityResult {
  capacity: string;
  path: string[];
}

export interface FoafPendingTransfer {
  id: string;
  idempotencyKey?: string;
  from?: string;
  to?: string;
  value?: string | number;
  operation?: string | number | null;
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled';
  [key: string]: unknown;
}

export interface FoafConfirmResult {
  status: 'confirmed';
  transfer: FoafPendingTransfer;
  operation: string;
  totalFees: number;
}

export interface FoafKeypair {
  address: string;
  publicKey: string;
  privateKey: string;
  seedPhrase?: string;
}

export interface StringStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type FoafSignatureProvider = (
  signerAddress: string,
  exactBody: string,
) => Promise<string | null> | string | null;

export interface FoafLedgerClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  signatureProvider?: FoafSignatureProvider;
}

export type FoafMutationResult<T> =
  | {
      ok: true;
      status: number;
      body: string;
      outcome: 'success';
      data: T;
    }
  | {
      ok: false;
      status: number;
      body: string | null;
      outcome: 'rejected' | 'ambiguous';
      error: string;
    };

/**
 * A row from the per-viewer `userTrustlines` endpoint
 * (`GET /networks/{net}/users/{addr}/trustlines`). These rows are ALREADY
 * viewer-oriented: `balance` is the viewer's balance (negative = the viewer
 * owes), `given` is credit the viewer extended TO the counterparty, `received`
 * is credit the counterparty extended TO the viewer.
 *
 * Primary field names match the live wire (`counterParty`, `given`,
 * `received`). The legacy/write-side aliases (`counterPartyAddress`,
 * `creditlineGiven`, …) are kept only as tolerant fallbacks so a raw
 * creditor-oriented `/trustlines` row still parses.
 */
export interface TrustlineRow {
  counterParty?: string;
  counterPartyAddress?: string;
  counter_party_address?: string;
  given?: string | number;
  received?: string | number;
  creditlineGiven?: string | number;
  creditline_given?: string | number;
  creditlineReceived?: string | number;
  creditline_received?: string | number;
  balance?: string | number;
  [key: string]: unknown;
}

export interface ViewerBalance {
  balance: string;
  creditlineGiven: string;
  creditlineReceived: string;
}
