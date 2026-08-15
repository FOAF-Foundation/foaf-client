// Source of truth: foaf-client/client/src/auth/types.ts

/**
 * Auth-owned identity record. Canonical fields live on auth.foaf.io.
 * `foaf_id` and `display_name` are optional during the auth.foaf.io
 * Phase 1/2 transition; jobs 09 / 17 make `foaf_id` required.
 */
export interface FoafIdentity {
  foaf_id?: string;
  user_name: string;
  display_name?: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  // ISO8601 when the email has been verified, else null. Identity-only —
  // the app reads it to show the Verified/Unverified badge.
  email_verified_at?: string | null;
  // An email change in flight, awaiting verification. The verified `email`
  // stays authoritative until the link is confirmed.
  pending_email?: string | null;
  has_password?: boolean;
  avatar_url: string | null;
  // The custodian's one-address-per-identity ledger address (0x…), bound on
  // auth.foaf.io. Absent/null until the wallet is minted (EC 1) — apps read it
  // straight off the session identity instead of accepting a client-supplied
  // (spoofable) address.
  foaf_address?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The known auth response shape variants the mapper layer accepts.
 * `legacy-jsonapi` is today's Rails JSON:API envelope; `legacy-flat` is the
 * fallback flat shape; `v1-token-identity` is the Phase 2+ envelope.
 * `oauth-link-required` and `oauth-needs-handle` are Job 49 OAuth callback
 * outcomes that carry a follow-up token rather than a session token.
 */
export type AuthResponseShape =
  | 'legacy-jsonapi'
  | 'legacy-flat'
  | 'v1-token-identity'
  | 'oauth-link-required'
  | 'oauth-needs-handle';

/**
 * Identity + token + the original payload. Apps use `raw` to extract
 * their own profile-shaped fields (e.g. Growoperative role/admin flags)
 * without forcing the protocol to know about app concerns.
 *
 * For `oauth-link-required` and `oauth-needs-handle` shapes, `identity` is
 * a hint-only placeholder and `token` is null — callers must inspect
 * `raw.link_challenge_token` / `raw.signup_token` and route through the
 * appropriate follow-up screen.
 */
export interface MappedAuthResponse {
  identity: FoafIdentity;
  token: string | null;
  shape: AuthResponseShape;
  raw: unknown;
}

/**
 * Job 49 — OAuth callback outcomes that aren't a session.
 */
export interface OAuthLinkRequiredOutcome {
  link_challenge_token: string;
  identity_hint: { user_name: string; email: string | null } | null;
}

export interface OAuthNeedsHandleOutcome {
  needs_handle: true;
  handle_candidate: string;
  signup_token: string;
}

export interface OAuthLinkSummary {
  provider: 'apple' | 'google' | 'facebook' | 'discord' | 'github';
  email: string | null;
  email_is_relay: boolean;
  linked_at: string | null;
  last_used_at: string | null;
}

export interface OAuthProviderAvailability {
  provider: 'apple' | 'google' | 'facebook' | 'discord' | 'github';
  enabled: boolean;
  client_id: string | null;
}

export interface OAuthStartResponse {
  authorization_url: string;
  state: string;
}

export type OAuthMode = 'login' | 'signup' | 'link';

export interface OAuthCompletePayload {
  code: string;
  state: string;
  invite_code?: string;
}

export interface OAuthAppleNativePayload {
  identity_token: string;
  nonce: string;
  full_name?: { firstName?: string | null; lastName?: string | null } | null;
  email?: string | null;
  invite_code?: string;
  /**
   * 'login' | 'signup' | 'link'. The server only CREATES a new identity in
   * 'signup' mode; omitting it defaults the server to 'login', which rejects
   * unregistered users with `no_account`. The browser flow carries mode via
   * the server-side state token; the native path must send it explicitly.
   */
  mode?: OAuthMode;
}

export interface OAuthGoogleNativePayload {
  /** Google id_token from the native Sign-In SDK (iOS/Android/web). */
  id_token: string;
  full_name?: { firstName?: string | null; lastName?: string | null } | null;
  email?: string | null;
  invite_code?: string;
  /** 'login' | 'signup' | 'link' — same contract as the Apple native payload. */
  mode?: OAuthMode;
}

export interface OAuthLinkCompletePayload {
  link_challenge_token: string;
  /** Password-proof path for an existing identity. */
  proof_kind?: 'password';
  password?: string;
  /** Handle-pick path when the auto-derived handle was reserved/taken. */
  user_name?: string;
}

/**
 * Stable, app-facing error envelope. Normalizes axios / Rails error
 * shapes into a single shape the UI can branch on via `code`.
 */
export interface FoafAuthError {
  message: string;
  status?: number;
  code?: string;
  email?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Known error codes the UI may branch on.
 */
export type FoafAuthErrorCode =
  | 'unknown_response_shape'
  | 'network_error'
  | 'invalid_credentials'
  | 'client_too_old_auth_bridge_expired'
  | 'auth_identity_not_found'
  | 'validation_failed'
  | 'unauthenticated';

/**
 * Pluggable token storage. Apps inject a platform-specific implementation
 * (web localStorage, native expo-secure-store, in-memory test double).
 */
export interface TokenStorage {
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
}

export interface SignupPayload {
  user_name: string;
  password: string;
  password_confirmation: string;
  first_name: string;
  last_name: string;
  email?: string;
  invite_code: string;
}

export interface PasswordChangePayload {
  password: string;
  password_confirmation: string;
}

export interface FoafAuthClientOptions {
  baseUrl: string;
  /** Registered app audience slug, e.g. `growoperative` or `orchardly`. */
  clientId: string;
  storage: TokenStorage;
  /** Send cookies with cross-origin requests. Defaults to false. */
  withCredentials?: boolean;
  /** Request timeout in ms. Defaults to 15000. */
  timeoutMs?: number;
  /** Override axios instance for tests. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- axios instance, typed at use-site
  httpClient?: any;
}
