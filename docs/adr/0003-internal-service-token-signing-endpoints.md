# ADR-0003: App↔custodian over internal service-token endpoints; service_tokens-table path only for sign/migrate
Status: accepted
Date: 2026-08-14

## Context

Apps (railsbackend, onloan-api, future) need the custodian to sign ledger payloads, mint
addresses, adopt migrated keys, and resolve counterparty addresses. The transport must not
expose an internet-facing signing oracle.

foaf-auth already has an internal-controller convention: `V1::Internal::*Controller` that
`include ServiceTokenAuthenticated` (e.g. `contact_edges_controller.rb:14-15`), mounted under
`/v1/internal`, service-token authed. But `ServiceTokenAuthenticator` accepts TWO token paths:
the `service_tokens` table (per-audience, hashed) AND a static, audience-agnostic env-var
`FOAF_AUTH_SERVICE_TOKEN` with no replay protection — a network-wide skeleton key.

## Decision

App↔custodian goes over **internal HTTPS endpoints on auth.foaf.io**, reusing the
`V1::Internal` + `ServiceTokenAuthenticated` convention, excluded from the public router and the
CORS allowlist, rack-attack-throttled.

For the **sign and migrate** endpoints specifically — the ones that wield key material — the
env-var stopgap is **forbidden**: they MUST require the `service_tokens`-table path (per-audience,
hashed) and reject `auth.source == 'env_var'`. Per-endpoint rack-attack throttles are added
(rack-attack is already in the Gemfile), mirroring the `admin_internal/ip` bucket. The audit
records the SHA-256 of the exact body signed (`body_sha256`), not just that a signature happened.

## Consequences

- A leaked env-var token cannot sign or migrate — it is bounded to the lower-risk read/mint paths
  at most (and those still reject it for sign/migrate).
- Every signature is forensically attributable to a body hash and a calling audience.
- The endpoints are synchronous; a transfer waits on its signature anyway, so no queue is needed.
