// Source of truth: foaf-client/client/__tests__/responseMappers.test.ts

import {
  detectAuthResponseShape,
  mapAuthResponse,
} from '../src/auth/responseMappers';
import { FoafAuthErrorShape } from '../src/auth/errors';

describe('detectAuthResponseShape', () => {
  it('identifies legacy-jsonapi by `data.attributes`', () => {
    expect(
      detectAuthResponseShape({
        data: { id: '1', type: 'users', attributes: { user_name: 'bruce' } },
      }),
    ).toBe('legacy-jsonapi');
  });

  it('identifies legacy-flat by top-level `user_name`', () => {
    expect(detectAuthResponseShape({ user_name: 'bruce', email: null })).toBe('legacy-flat');
  });

  it('identifies v1-token-identity by top-level `identity` object', () => {
    expect(
      detectAuthResponseShape({ token: 'jwt', identity: { foaf_id: 'uuid', user_name: 'b' } }),
    ).toBe('v1-token-identity');
  });

  it('identifies oauth-link-required by `link_challenge_token`', () => {
    expect(
      detectAuthResponseShape({
        link_challenge_token: 'chal-abc',
        identity_hint: { user_name: 'bruce', email: 'b@example.test' },
      }),
    ).toBe('oauth-link-required');
  });

  it('identifies oauth-needs-handle by `needs_handle` + `signup_token`', () => {
    expect(
      detectAuthResponseShape({
        needs_handle: true,
        handle_candidate: 'janebird',
        signup_token: 'sig-xyz',
      }),
    ).toBe('oauth-needs-handle');
  });

  it('returns null for arrays, primitives, and unknown objects', () => {
    expect(detectAuthResponseShape([])).toBeNull();
    expect(detectAuthResponseShape('string')).toBeNull();
    expect(detectAuthResponseShape(42)).toBeNull();
    expect(detectAuthResponseShape(null)).toBeNull();
    expect(detectAuthResponseShape({})).toBeNull();
    expect(detectAuthResponseShape({ random: 'thing' })).toBeNull();
  });
});

describe('mapAuthResponse — legacy-jsonapi', () => {
  it('maps a typical Rails JSON:API response to identity-only fields', () => {
    const raw = {
      data: {
        id: '7',
        type: 'users',
        attributes: {
          user_name: 'bruce',
          first_name: 'Bruce',
          last_name: 'Wayne',
          email: 'bruce@example.com',
          // Profile-shaped fields are intentionally NOT extracted by the
          // protocol mapper. They stay on `raw` for the app to handle.
          user_types: [{ group_label: 'producer' }],
          avatar_url: null,
          invite_limit: 5,
          created_at: '2026-01-01',
          updated_at: '2026-01-02',
          subnet_memberships: [],
        },
      },
      token: 'jwt-aaa',
    };
    const result = mapAuthResponse(raw);
    expect(result.shape).toBe('legacy-jsonapi');
    expect(result.token).toBe('jwt-aaa');
    expect(result.identity).toEqual({
      foaf_id: undefined,
      user_name: 'bruce',
      first_name: 'Bruce',
      last_name: 'Wayne',
      email: 'bruce@example.com',
      avatar_url: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
    });
    // Profile fields stay on raw so the app can extract them separately.
    expect(result.raw).toBe(raw);
  });

  it('returns token=null when the response carries no token', () => {
    const result = mapAuthResponse({
      data: { id: '1', type: 'users', attributes: { user_name: 'x' } },
    });
    expect(result.token).toBeNull();
  });
});

describe('mapAuthResponse — legacy-flat', () => {
  it('maps a flat top-level response', () => {
    const raw = {
      id: 3,
      user_name: 'flat_user',
      first_name: 'Flat',
      last_name: 'User',
      email: 'f@example.com',
      avatar_url: null,
      created_at: '2026-02-01',
      updated_at: '2026-02-01',
      token: 'jwt-bbb',
    };
    const result = mapAuthResponse(raw);
    expect(result.shape).toBe('legacy-flat');
    expect(result.token).toBe('jwt-bbb');
    expect(result.identity.user_name).toBe('flat_user');
  });

  it('falls back to splitting `name` when first/last are absent', () => {
    const result = mapAuthResponse({
      user_name: 'x',
      name: 'Alice Beth Carter',
      email: null,
      avatar_url: null,
      created_at: '',
      updated_at: '',
    });
    expect(result.identity.first_name).toBe('Alice');
    expect(result.identity.last_name).toBe('Beth Carter');
  });
});

describe('mapAuthResponse — v1-token-identity', () => {
  it('maps the Phase-2+ envelope with separate identity object', () => {
    const raw = {
      token: 'jwt-ccc',
      identity: {
        foaf_id: 'foaf-uuid-123',
        user_name: 'v1user',
        display_name: 'V One User',
        first_name: 'V',
        last_name: 'One',
        email: 'v1@example.com',
        has_password: false,
        avatar_url: null,
        created_at: '2026-03-01',
        updated_at: '2026-03-01',
      },
    };
    const result = mapAuthResponse(raw);
    expect(result.shape).toBe('v1-token-identity');
    expect(result.token).toBe('jwt-ccc');
    expect(result.identity.foaf_id).toBe('foaf-uuid-123');
    expect(result.identity.user_name).toBe('v1user');
    expect(result.identity.display_name).toBe('V One User');
    expect(result.identity.has_password).toBe(false);
  });

  it('copies email_verified_at + pending_email when present (Job 50)', () => {
    const result = mapAuthResponse({
      token: 'jwt-ev',
      identity: {
        foaf_id: 'foaf-ev',
        user_name: 'evuser',
        first_name: 'E',
        last_name: 'V',
        email: 'ev@example.com',
        email_verified_at: '2026-06-08T00:00:00Z',
        pending_email: 'new@example.com',
        avatar_url: null,
        created_at: '',
        updated_at: '',
      },
    });
    expect(result.identity.email_verified_at).toBe('2026-06-08T00:00:00Z');
    expect(result.identity.pending_email).toBe('new@example.com');
  });

  // One foaf_address per identity (AC 2 TS side). Copied via the same
  // present-key guard as email_verified_at, so it reaches the identity from
  // both flat and v1 shapes.
  it('copies foaf_address when present', () => {
    const result = mapAuthResponse({
      token: 'jwt-fa',
      identity: {
        foaf_id: 'foaf-fa',
        user_name: 'fauser',
        first_name: 'F',
        last_name: 'A',
        email: 'fa@example.com',
        foaf_address: '0x1111111111111111111111111111111111111111',
        avatar_url: null,
        created_at: '',
        updated_at: '',
      },
    });
    expect(result.identity.foaf_address).toBe('0x1111111111111111111111111111111111111111');
  });

  // EC 1: an unbound wallet is absent, never an empty string.
  it('leaves foaf_address undefined when the claim is absent (EC 1)', () => {
    const result = mapAuthResponse({
      token: 'jwt-nofa',
      identity: {
        foaf_id: 'foaf-nofa',
        user_name: 'nofauser',
        first_name: 'N',
        last_name: 'F',
        email: 'nofa@example.com',
        avatar_url: null,
        created_at: '',
        updated_at: '',
      },
    });
    expect(result.identity.foaf_address).toBeUndefined();
  });

  // EC 1 on the wire: token_identity always emits foaf_address, so an unbound
  // wallet arrives as an explicit null (not an omitted key). asString(null) is
  // null, so it stays null through the mapper — never coerced to '' or dropped.
  it('preserves foaf_address as null when the claim is explicitly null (EC 1)', () => {
    const result = mapAuthResponse({
      token: 'jwt-nullfa',
      identity: {
        foaf_id: 'foaf-nullfa',
        user_name: 'nullfauser',
        first_name: 'N',
        last_name: 'U',
        email: 'nullfa@example.com',
        foaf_address: null,
        avatar_url: null,
        created_at: '',
        updated_at: '',
      },
    });
    expect(result.identity.foaf_address).toBeNull();
  });
});

describe('mapAuthResponse — unknown shapes', () => {
  it('throws FoafAuthError with code unknown_response_shape on unrecognised payload', () => {
    expect(() => mapAuthResponse({ random: 'thing' })).toThrow(FoafAuthErrorShape);
    try {
      mapAuthResponse({ random: 'thing' });
      throw new Error('should not reach here');
    } catch (err) {
      expect(err).toBeInstanceOf(FoafAuthErrorShape);
      expect((err as FoafAuthErrorShape).code).toBe('unknown_response_shape');
    }
  });
});

describe('mapAuthResponse — protocol/app boundary', () => {
  it('does not include any Growoperative-specific fields on identity', () => {
    const result = mapAuthResponse({
      data: {
        id: '1',
        type: 'users',
        attributes: {
          user_name: 'x',
          first_name: 'X',
          last_name: 'Y',
          email: null,
          avatar_url: null,
          created_at: '',
          updated_at: '',
          // Profile-shaped fields the protocol must NOT leak into identity.
          user_types: [{ group_label: 'admin' }],
          invite_limit: 10,
          subnet_memberships: [{ id: 1 }],
        },
      },
    });
    const identityKeys = Object.keys(result.identity);
    expect(identityKeys).not.toContain('role');
    expect(identityKeys).not.toContain('is_admin');
    expect(identityKeys).not.toContain('is_demo');
    expect(identityKeys).not.toContain('is_superuser');
    expect(identityKeys).not.toContain('invitation_limit');
    expect(identityKeys).not.toContain('subnet_memberships');
    expect(identityKeys).not.toContain('id');
  });
});

describe('mapAuthResponse — oauth follow-up envelopes', () => {
  it('maps oauth-link-required with identity hint', () => {
    const raw = {
      link_challenge_token: 'challenge-token-xyz',
      identity_hint: { user_name: 'jane', email: 'jane@example.test' },
    };
    const result = mapAuthResponse(raw);
    expect(result.shape).toBe('oauth-link-required');
    expect(result.token).toBeNull();
    expect(result.identity.user_name).toBe('jane');
    expect(result.identity.email).toBe('jane@example.test');
    expect(result.raw).toBe(raw);
  });

  it('maps oauth-link-required with null hint', () => {
    const raw = { link_challenge_token: 'challenge-token-xyz', identity_hint: null };
    const result = mapAuthResponse(raw);
    expect(result.shape).toBe('oauth-link-required');
    expect(result.identity.user_name).toBe('');
    expect(result.identity.email).toBeNull();
  });

  it('maps oauth-needs-handle and surfaces the candidate handle', () => {
    const raw = {
      needs_handle: true,
      handle_candidate: 'janebird',
      signup_token: 'signup-token-xyz',
    };
    const result = mapAuthResponse(raw);
    expect(result.shape).toBe('oauth-needs-handle');
    expect(result.token).toBeNull();
    expect(result.identity.user_name).toBe('janebird');
  });
});
