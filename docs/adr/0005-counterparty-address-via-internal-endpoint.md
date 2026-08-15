# ADR-0005: Counterparty address resolved via an internal auth endpoint keyed by a caller-known foaf_id
Status: accepted
Date: 2026-08-14

## Context

The `foaf_address` JWT claim proves only the CALLER's own address. But some operations carry a
counterparty address for a DIFFERENT `foaf_id`. The sharpest case: onloan-api's lender-only loan
`create` (`loans_controller.rb`) carries both `lender_address` (the caller's own) and
`borrower_address` (a different `foaf_id`). Today both arrive as **client-supplied request
params** — spoofable, not proven by auth. FR 7 / AC 3 require that no ledger call take a
client-supplied borrower/lender address.

The caller's token cannot prove a counterparty's address. But the caller DOES legitimately know
the counterparty's `foaf_id` — `create` already carries `borrower_foaf_id` as the loan key
(`loans_controller.rb:67`), obtained from the social graph / loan relationship.

## Decision

Add an internal auth endpoint **`GET /v1/internal/identities/:foaf_id/foaf_address`** that returns
the canonical `foaf_address` for a `foaf_id` from auth's binding (404 when the identity has no
address yet). auth owns the `foaf_id → foaf_address` binding, so it is the non-spoofable resolver.

- The caller's own address → the verified JWT claim `claims["foaf_address"]`.
- A counterparty's address → this endpoint, keyed by the `foaf_id` the caller already holds.

Neither address is a client-supplied ledger param post-port (AC 3). The endpoint is service-token
authed (any registered `service_tokens` audience, env-var path still forbidden), internal-only,
CORS-excluded, rack-attack-throttled. It exposes only the address (public-ledger data), no key,
no PII beyond the ledger node. The SDK gets a thin typed resolver so apps call it the same way
they verify a token.

## Consequences

- Needs a Requirements/AC addition (a counterparty-address-resolution FR; a tightening of FR 7 to
  name both the caller-claim path and the counterparty-lookup path). Flagged for the Analyst.
- Prevents the endpoint becoming a harvesting oracle via internal-only + throttle + address-only.
