import axios from 'axios';
import type {
  FoafContactEdge,
  FoafContactsClientOptions,
  FoafContactsResponse,
} from './types';

function nonBlankProfileText(value: string | null): string | null {
  return value?.trim() ? value : null;
}

function normalizeContactEdge(edge: FoafContactEdge): FoafContactEdge {
  return {
    ...edge,
    // auth.foaf.io may serialize an unset profile field as an empty string.
    // Canonicalize that wire shape here so every consumer's null fallback
    // reaches the handle (and ultimately the FOAF ID) consistently.
    display_name: nonBlankProfileText(edge.display_name),
    user_name: nonBlankProfileText(edge.user_name),
  };
}

/**
 * Reads canonical contact edges from auth.foaf.io. It deliberately returns
 * only graph data; an app projects identities, profiles, and ledger addresses
 * through its own API rather than coupling auth to those concerns.
 */
export class FoafContactsClient {
  private readonly clientId: string;
  private readonly storage: FoafContactsClientOptions['storage'];
  private readonly http: NonNullable<FoafContactsClientOptions['httpClient']>;

  constructor(options: FoafContactsClientOptions) {
    this.clientId = options.clientId;
    this.storage = options.storage;
    this.http =
      options.httpClient ??
      axios.create({
        baseURL: options.baseUrl,
        timeout: options.timeoutMs ?? 15000,
        headers: { 'Content-Type': 'application/json' },
      });
  }

  async list(): Promise<FoafContactEdge[]> {
    const token = await this.storage.getToken();
    const response = await this.http.get('/v1/contacts', {
      params: { client_id: this.clientId },
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = response.data as FoafContactsResponse;
    return Array.isArray(body?.contacts) ? body.contacts.map(normalizeContactEdge) : [];
  }
}
