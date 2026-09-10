// Source of truth: foaf-client/client/src/auth/responseMappers.ts

import { FoafAuthErrorShape } from './errors';
import type { AuthResponseShape, FoafIdentity, MappedAuthResponse } from './types';

/**
 * Bidirectional response-shape mapper layer. Tolerates the three known
 * auth response shapes during the auth.foaf.io migration:
 *
 *   - `legacy-jsonapi`     — `{ data: { id, type, attributes: {...} }, token? }`
 *   - `legacy-flat`        — flat fallback `{ user_name, ..., token? }`
 *   - `v1-token-identity`  — Phase 2+ envelope `{ token, identity: { foaf_id, ... } }`
 *
 * The mapper is bidirectional: it must work for old-app + new-backend AND
 * new-app + old-backend during the rollout window. Unknown fields are
 * dropped silently. Unknown shapes throw a `FoafAuthError` with code
 * `unknown_response_shape`.
 *
 * The mapper returns *identity only*. Apps that need profile-shaped
 * fields (Growoperative role/admin/subnet, Orchardly Person rows, etc.)
 * extract them from `MappedAuthResponse.raw` at the call site.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function deriveNames(attrs: Record<string, unknown>): { first: string; last: string } {
  const explicitFirst = asString(attrs.first_name);
  const explicitLast = asString(attrs.last_name);
  if (explicitFirst !== null || explicitLast !== null) {
    return { first: explicitFirst ?? '', last: explicitLast ?? '' };
  }
  const fullName = asString(attrs.name);
  if (fullName === null) return { first: '', last: '' };
  const parts = fullName.split(' ');
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

function mapFlatAttributes(attrs: Record<string, unknown>): FoafIdentity {
  const { first, last } = deriveNames(attrs);
  const identity: FoafIdentity = {
    foaf_id: asString(attrs.foaf_id) ?? undefined,
    user_name: asString(attrs.user_name) ?? '',
    display_name: 'display_name' in attrs ? asString(attrs.display_name) : undefined,
    first_name: first,
    last_name: last,
    email: asString(attrs.email),
    // Email-verification fields. Copied like display_name (present-key guard)
    // so they populate from mapAuthResponse — without this they'd never reach
    // the badge / account-settings UI.
    email_verified_at: 'email_verified_at' in attrs ? asString(attrs.email_verified_at) : undefined,
    pending_email: 'pending_email' in attrs ? asString(attrs.pending_email) : undefined,
    // Custodian ledger address. Same present-key guard as email_verified_at so
    // it flows from both the flat and v1-token-identity shapes; absent (not '')
    // when the wallet is unbound (EC 1).
    foaf_address: 'foaf_address' in attrs ? asString(attrs.foaf_address) : undefined,
    avatar_url: asString(attrs.avatar_url),
    // Enriched profile fields, present-key guarded like email_verified_at so
    // they flow from both the flat and v1-token-identity shapes into the editor.
    about: 'about' in attrs ? asString(attrs.about) : undefined,
    area_label: 'area_label' in attrs ? asString(attrs.area_label) : undefined,
    created_at: asString(attrs.created_at) ?? '',
    updated_at: asString(attrs.updated_at) ?? '',
  };
  const hasPassword = asBoolean(attrs.has_password);
  if (hasPassword !== undefined) {
    identity.has_password = hasPassword;
  }
  return identity;
}

/**
 * Detect which shape variant the server returned. Order matters: OAuth
 * follow-up envelopes go first (they're keyed by their respective tokens
 * and carry no `identity` or `data`), then v1 (top-level `identity` key),
 * then JSON:API (top-level `data` with `attributes`), then the flat fallback.
 */
export function detectAuthResponseShape(raw: unknown): AuthResponseShape | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.link_challenge_token === 'string' && raw.link_challenge_token.length > 0) {
    return 'oauth-link-required';
  }
  if (raw.needs_handle === true && typeof raw.signup_token === 'string') {
    return 'oauth-needs-handle';
  }
  if (isPlainObject(raw.identity)) return 'v1-token-identity';
  if (isPlainObject(raw.data) && 'attributes' in raw.data) return 'legacy-jsonapi';
  if ('user_name' in raw || 'attributes' in raw) return 'legacy-flat';
  return null;
}

function mapJsonApi(raw: Record<string, unknown>): MappedAuthResponse {
  const data = raw.data as Record<string, unknown>;
  const attrs = (data.attributes as Record<string, unknown>) ?? {};
  return {
    identity: mapFlatAttributes(attrs),
    token: asString(raw.token),
    shape: 'legacy-jsonapi',
    raw,
  };
}

function mapFlat(raw: Record<string, unknown>): MappedAuthResponse {
  const attrs = isPlainObject(raw.attributes)
    ? (raw.attributes as Record<string, unknown>)
    : raw;
  return {
    identity: mapFlatAttributes(attrs),
    token: asString(raw.token),
    shape: 'legacy-flat',
    raw,
  };
}

function mapV1(raw: Record<string, unknown>): MappedAuthResponse {
  const identity = raw.identity as Record<string, unknown>;
  return {
    identity: mapFlatAttributes(identity),
    token: asString(raw.token),
    shape: 'v1-token-identity',
    raw,
  };
}

// Both OAuth follow-up shapes synthesize a stub identity so the return type
// stays uniform. Callers MUST inspect `shape` (or the more specific
// `MappedAuthResponse.raw.link_challenge_token` / `raw.signup_token`)
// before using `identity` — it's a hint here, never a logged-in user.
const STUB_IDENTITY: FoafIdentity = {
  user_name: '',
  first_name: '',
  last_name: '',
  email: null,
  avatar_url: null,
  created_at: '',
  updated_at: '',
};

function mapOAuthLinkRequired(raw: Record<string, unknown>): MappedAuthResponse {
  const hint = isPlainObject(raw.identity_hint) ? raw.identity_hint : null;
  return {
    identity: hint
      ? { ...STUB_IDENTITY, user_name: asString(hint.user_name) ?? '', email: asString(hint.email) }
      : STUB_IDENTITY,
    token: null,
    shape: 'oauth-link-required',
    raw,
  };
}

function mapOAuthNeedsHandle(raw: Record<string, unknown>): MappedAuthResponse {
  return {
    identity: { ...STUB_IDENTITY, user_name: asString(raw.handle_candidate) ?? '' },
    token: null,
    shape: 'oauth-needs-handle',
    raw,
  };
}

/**
 * Map a server auth response to a `FoafIdentity` plus optional token.
 * Throws a `FoafAuthErrorShape` with code `unknown_response_shape` if
 * the payload doesn't match any known variant.
 */
export function mapAuthResponse(raw: unknown): MappedAuthResponse {
  const shape = detectAuthResponseShape(raw);
  if (!shape) {
    throw new FoafAuthErrorShape({
      message: 'Auth response did not match any known shape variant.',
      code: 'unknown_response_shape',
    });
  }
  switch (shape) {
    case 'v1-token-identity':
      return mapV1(raw as Record<string, unknown>);
    case 'legacy-jsonapi':
      return mapJsonApi(raw as Record<string, unknown>);
    case 'legacy-flat':
      return mapFlat(raw as Record<string, unknown>);
    case 'oauth-link-required':
      return mapOAuthLinkRequired(raw as Record<string, unknown>);
    case 'oauth-needs-handle':
      return mapOAuthNeedsHandle(raw as Record<string, unknown>);
  }
}
