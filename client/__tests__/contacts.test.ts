import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMemoryTokenStorage } from '../src/auth';
import { FoafContactsClient } from '../src/contacts';
import type { FoafContactEdge } from '../src/contacts';

describe('FoafContactsClient', () => {
  it('passes audience and Bearer token and returns graph edges', async () => {
    const get = jest.fn(async () => ({
      data: {
        contacts: [
          {
            foaf_id: 'identity-2',
            created_at: '2026-07-24T00:00:00Z',
            created_via_invitation_id: null,
            user_name: null,
            display_name: null,
            avatar_url: null,
            about: null,
            area_label: null,
            foaf_address: null,
          },
        ],
      },
    }));
    const client = new FoafContactsClient({
      baseUrl: 'https://auth.foaf.test',
      clientId: 'onloan',
      storage: createMemoryTokenStorage('token'),
      httpClient: { get },
    });

    expect(await client.list()).toHaveLength(1);
    expect(get).toHaveBeenCalledWith('/v1/contacts', {
      params: { client_id: 'onloan' },
      headers: { Authorization: 'Bearer token' },
    });
  });

  it('normalizes blank identity text so consumers can fall back to the handle', async () => {
    const get = jest.fn(async () => ({
      data: {
        contacts: [
          {
            foaf_id: 'identity-sara',
            created_at: '2026-09-07T00:00:00Z',
            created_via_invitation_id: null,
            user_name: 'sara',
            display_name: '',
            avatar_url: null,
            about: 'Sells sourdough on Saturdays.',
            area_label: 'Kaslo, BC',
            foaf_address: '0x6c5bfe5026359c309c08d39c8156db6d0e7cd161',
          },
          {
            foaf_id: 'identity-handle-fallback',
            created_at: null,
            created_via_invitation_id: null,
            user_name: '   ',
            display_name: '\t',
            avatar_url: null,
            about: null,
            area_label: null,
            foaf_address: null,
          },
        ],
      },
    }));
    const client = new FoafContactsClient({
      baseUrl: 'https://auth.foaf.test',
      clientId: 'onloan',
      storage: createMemoryTokenStorage('token'),
      httpClient: { get },
    });

    const contacts = await client.list();

    expect(contacts[0]).toMatchObject({ user_name: 'sara', display_name: null });
    expect(contacts[1]).toMatchObject({ user_name: null, display_name: null });
  });
});

describe('contacts-envelope fixture: enriched FoafContactEdge shape', () => {
  const fixture = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../contracts/contacts-envelope.json'),
      'utf8',
    ),
  ) as { confirmed: FoafContactEdge; unconfirmed: FoafContactEdge };

  // Compile-time seam: if the fixture drifts from FoafContactEdge (or the type
  // loses a field), these typed assignments fail to compile under strict mode.
  const confirmed: FoafContactEdge = fixture.confirmed;
  const unconfirmed: FoafContactEdge = fixture.unconfirmed;

  it('exposes all enriched fields non-null for a confirmed contact', () => {
    expect(confirmed.foaf_address).not.toBeNull();
    expect(confirmed.user_name).not.toBeNull();
    expect(confirmed.display_name).not.toBeNull();
    expect(confirmed.avatar_url).not.toBeNull();
    expect(confirmed.about).not.toBeNull();
    expect(confirmed.area_label).not.toBeNull();
    expect(confirmed.foaf_address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('nulls foaf_address (and the profile fields) for an unconfirmed contact', () => {
    expect(unconfirmed.foaf_address).toBeNull();
    expect(unconfirmed.user_name).toBeNull();
    expect(unconfirmed.display_name).toBeNull();
    expect(unconfirmed.avatar_url).toBeNull();
    expect(unconfirmed.about).toBeNull();
    expect(unconfirmed.area_label).toBeNull();
  });
});
