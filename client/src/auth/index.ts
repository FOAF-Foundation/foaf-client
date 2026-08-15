// Source of truth: foaf-client/client/src/auth/index.ts

export { FoafAuthClient } from './FoafAuthClient';
export { resolveFoafAddress } from './counterparty';
export {
  FoafAuthErrorShape,
  normalizeError,
} from './errors';
export {
  detectAuthResponseShape,
  mapAuthResponse,
} from './responseMappers';
export { createMemoryTokenStorage } from './storage';
export type {
  AuthResponseShape,
  FoafAuthClientOptions,
  FoafAuthError,
  FoafAuthErrorCode,
  FoafIdentity,
  MappedAuthResponse,
  OAuthAppleNativePayload,
  OAuthGoogleNativePayload,
  OAuthCompletePayload,
  OAuthLinkCompletePayload,
  OAuthLinkRequiredOutcome,
  OAuthLinkSummary,
  OAuthMode,
  OAuthNeedsHandleOutcome,
  OAuthProviderAvailability,
  OAuthStartResponse,
  PasswordChangePayload,
  SignupPayload,
  TokenStorage,
} from './types';
