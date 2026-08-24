# ADR-0006: Session-authed sign-for-self endpoint on auth.foaf.io for UI-only apps
Status: accepted
Date: 2026-08-23

## Context

A UI-only FOAF app (FOAFledger, and eventually any `foaf-client`-only shell) has no product
backend of its own. It talks only to `auth.foaf.io` (identity + contacts) and `api.foaf.io`
(the ledger) through the shared `foaf-client`. It needs to record ledger writes — a payment, a
trustline update — which the FOAF protocol requires be Ethereum `personal_sign`-signed over the
exact UTF-8 request body (`key_store.rb:115` `key.personal_sign(exact_body)`; AGENTS.md protocol
constraints).

Today the only custodial-signing path is ADR-0003's `POST /v1/internal/custodian/sign`: internal
router only (`routes.rb:109-113`), CORS-excluded, **service-token authed**
(`SigningController include ServiceTokenAuthenticated`, `signing_controller.rb:13`), and the
TS entry point `createRemoteCustodianSignatureProvider` (`ledger/signer.ts:75`) sends the
service token in an `Authorization: Bearer` header. That path is built for an **app backend** to
hold the token and call the custodian on the user's behalf. A UI-only app has no backend and no
safe place to hold a service token; putting one in a browser bundle would be exactly the
"network-wide skeleton key" ADR-0003 forbids and would violate FR-4.1 (no service-token or
static credential in a browser-accessible flow).

**Authority alignment (why this grant is safe — Robin's rationale).** "Sign my payment" is
authorized by MY session — a strictly TIGHTER grant than the app service tokens ADR-0003 already
blesses, which can sign for ANY user of the app. The stolen-Bearer blast radius is UNCHANGED
versus today's app-mediated payments: an app already signs on the user's behalf via its service
token, and a stolen session Bearer signs for exactly one user either way. The difference here is
only *where the session check lives* — in `auth.foaf.io` itself rather than in an app backend one
hop away. This is consistent with ADR-0004's device-custody provider swap coming later: the write
path is a `signature_provider` seam, and this ADR adds one provider that happens to sign
server-side against the caller's own key.

ADR-0003's decision covers two things that this ADR must separate:
1. **The general internal transport** for app↔custodian (mint, migrate, sign, counterparty
   resolve) — service-token authed, internal-only, with the env-var stopgap forbidden for
   sign/migrate (`signing_controller.rb:47` rejects `auth.source == 'env_var'`). This is correct
   and stays authoritative.
2. **The specific `/v1/internal/custodian/sign` endpoint being the ONLY way to reach the signer.**
   ADR-0003 rejected "an internet-facing signing oracle." The rejected thing was an
   *unauthenticated or weakly-authenticated* oracle whose compromise signs for **any** user. The
   narrower case — a browser-reachable endpoint that signs the **authenticated caller's OWN key
   only**, authorized by the same RS256 session JWT the caller already holds — was not the case
   ADR-0003 weighed, and it does not carry the same blast radius.

The real tradeoff: adding a browser-reachable signing endpoint on `auth.foaf.io` widens the
network surface by one route. Weighed against options (b) a new shared "wallet write" service and
(c) a per-app thin backend, both of which add a deployable to run and, per the brief, differ from
(a) mostly in *where the session check lives*, not in attack surface — a leaked-credential
compromise in (b)/(c) reaches the same `KeyStore.sign` one hop further away. Option (c) also
directly contradicts the "foaf-client only app" goal.

## Decision

Add a **session-authed** `POST /v1/custodian/sign_for_self` on `auth.foaf.io`, on the **public
router** (CORS-allowlisted so browser origins can reach it), that signs the authenticated
caller's own custodial key only. It reuses the existing `Foaf::Custodian::KeyStore.sign`
(`key_store.rb:107`) — same signer, same `body_sha256` audit row (`key_store.rb:127`) — so
every signature stays forensically attributable exactly as ADR-0003 required.

The endpoint is a `V1::BaseController` subclass (NOT `ServiceTokenAuthenticated`) with
`before_action :require_identity!` (`base_controller.rb:86`), mirroring `ContactsController`
(`contacts_controller.rb:6`). It satisfies the FR-4 invariants under five HARD conditions, each
of which is load-bearing and must be encoded structurally — not by convention, not by regex:

- **FR-4.1 session-authorized only** — auth is the caller's RS256 Bearer session token via
  `require_identity!` → `current_identity` → `JwtVerifier` (`base_controller.rb:64-76`). No
  service token, no static credential. The env-var stopgap cannot reach it (it is not a
  service-token endpoint at all).

- **FR-4.2 — CONDITION 1: signer derived ONLY from the RS256-verified `sub`.** The signer is the
  identity loaded from the verified token's `sub` (`foaf_id`) claim
  (`base_controller.rb:72` `Identity.active.find_by(foaf_id: decoded['sub'])`), and the endpoint
  calls `KeyStore.sign(current_identity.foaf_id, canonical_body, actor: ...)` passing that
  `foaf_id` — NEVER an address or identity taken from the request. NO signer/identity/address
  parameter is EVER read from the request body or query for signer selection; the bound
  `foaf_address` comes from the identity row server-side (`Identity#foaf_address`), not from the
  request. A request that carries ANY signer/identity/address/`foaf_id`/`signer_address` param
  (the shape ADR-0003's internal endpoint accepts at `signing_controller.rb:5`) is REJECTED with
  a **422** — never honored, never silently ignored. As defense-in-depth, if the verified token
  carries a `foaf_address` claim (`jwt_issuer.rb:31` — present only when the wallet is bound), it
  must equal `current_identity.foaf_address`; a mismatch or a missing-wallet identity is a
  **403**. Cross-account signing is structurally impossible because the key is loaded from the
  caller's own `sub` and the request cannot name a different signer.

- **FR-4.5 — CONDITION 2: op-shape allowlist enforced STRUCTURALLY, never by regex, with an
  exact-body re-serialization.** The endpoint (1) parses the request body as JSON, (2) validates
  the parsed structure against the allowlisted FOAF ledger operation schemas, and (3) RE-SERIALIZES
  the exact bytes that get signed from the *validated* structure, discarding the raw wire bytes.
  Anything that fails schema validation is a **422**. The endpoint is therefore structurally UNABLE
  to sign arbitrary bytes: only bytes produced by re-serializing a schema-valid allowlisted
  operation reach `KeyStore.sign`.

  **v1 allowlist = exactly TWO address-bearing shapes.** The allowlist is
  `{ updateTrustline, createPendingTransfer }` — the shapes whose signed body carries the party
  addresses inline (`updateTrustline`: `creditor_address, debtor_address, creditline_given,
  creditline_received`, `FoafLedgerClient.ts:49-54`; `createPendingTransfer`: `network_address,
  from_address, to_address, value, extra_data` + optional `max_fee, fee_payer, path,
  idempotency_key`, `FoafLedgerClient.ts:88-98`). **`confirmTransfer` and `rejectTransfer` are
  EXCLUDED from the browser allowlist for v1** and are rejected with **422**. Reason: those two ops
  sign an EMPTY body — `confirmTransfer` signs `'{}'` (`FoafLedgerClient.ts:131`), `rejectTransfer`
  signs `'{}'`/`{ reason }` (`FoafLedgerClient.ts:143`) — while the pending-transfer ID that scopes
  them lives in the URL PATH, not the signed body. A body-only structural allowlist can only see the
  body, so it would hand back a signature over `'{}'` that is replayable against ANY confirm/reject
  for ANY transfer, which would break the own-key-only guarantee (CONDITION 5 / AC-14) for those ops.
  A UI-only app never confirms/rejects pending transfers in v1; its write path is create + update
  only (see the FR-3.6 `action → method` mapping). A future version that needs browser
  confirm/reject must first bind the URL transfer-id into the signed canonical body and prove
  non-replayability with a new AC.

  **Exact-body coupling + canonicalization rule (PINNED — the endpoint↔client byte contract).**
  FOAF signatures are `personal_sign` over the EXACT UTF-8 body sent on the wire to `api.foaf.io`
  (`key_store.rb:115`), so the signed bytes and the wire bytes MUST be byte-identical. The
  **authoritative serialization is the client's `JSON.stringify(payload)`** (`FoafLedgerClient.ts:49`
  / `:99`); the server re-serializer matches the client, NOT the reverse. The canonical body is:
  UTF-8; **no inserted whitespace** (exactly `JSON.stringify` output — no spaces after `:` or `,`);
  **client INSERTION key order preserved, NOT sorted** (`updateTrustline`: `creditor_address,
  debtor_address, creditline_given, creditline_received`; `createPendingTransfer`: `network_address,
  from_address, to_address, value, extra_data`, then any present of `max_fee, fee_payer, path,
  idempotency_key` in that order — the client does not sort, so sorting on the server would break
  byte-equality); **all ledger values transmitted as strings** (addresses, `value`, creditlines are
  strings today, `FoafLedgerClient.ts:49-54, 88-92`), so there is no JS↔Ruby number-format
  divergence (`1` vs `1.0`) to reconcile. The server re-serializer MUST reproduce these exact bytes
  for each allowlisted op. `createSessionSignatureProvider` and Phase 3's `PaymentModal onSubmit` →
  `FoafLedgerClient.createPendingTransfer`/`updateTrustline` send the SAME canonical bytes the
  endpoint signed, or the signature will not verify. Byte-equality is machine-checked by a Phase-1
  `contracts/` canonical-op fixture: the client asserts `JSON.stringify(payload)` equals the fixture
  bytes and the foaf-auth re-serializer asserts its output equals the same fixture bytes.

- **FR-4.3 — CONDITION 3 (throttle half): dual rack-attack buckets.** A dedicated
  `custodian_sign_for_self/ip` bucket (60/min, mirroring `custodian_sign/ip`,
  `rack_attack.rb:123`) AND a per-`sub` bucket keyed on the verified `sub` — BOTH must fire,
  separate from the general read buckets. Per-IP alone lets one compromised session behind a NAT
  hide in the crowd; per-`sub` alone lets a botnet spread the load. Both together bound a
  single-account abuser regardless of IP and a single-IP abuser regardless of account.

- **FR-4.4 — CONDITION 3 (audit half): audit records `body_sha256` AND `aud`.** The signing
  event reuses `KeyStore.sign`'s existing `body_sha256` audit row
  (`key_store.rb:127` `Digest::SHA256.hexdigest(exact_body)`) — hashing the exact canonical body
  that was signed — and passes `actor: "session:#{aud}"` where `aud` is the verified token's
  audience (`current_decoded_token['aud']`, `base_controller.rb:41`). The recorded
  `custodian_key_events` row therefore carries BOTH the `body_sha256` of the exact signed bytes
  AND the token's `aud`, so a session-signed event is distinguishable from a service-token-signed
  one and attributable to a specific app audience.

Client side: a new `createSessionSignatureProvider(fetchFn, baseUrl, getToken)` in
`ledger/signer.ts` — same `FoafSignatureProvider` shape as the existing providers — posts the
canonical `exact_body` with the session `Authorization: Bearer` header, and sends that SAME
canonical body to `api.foaf.io` so the signature verifies. The FOAFledger shell wires it into
`FoafLedgerClient({ signatureProvider })`; no app backend, no service token in the browser.

**CONDITION 4 — the supersession of ADR-0003 is NARROW.** ADR-0003 is marked
`superseded-by-0006` ONLY for the single question it and this ADR both weigh: whether a
browser-reachable endpoint may sign the authenticated caller's OWN custodial key. Everything else
in ADR-0003 stays authoritative and UNCHANGED:
- ADR-0003's **service-token transport** for backend-holding apps (railsbackend, onloan-api) —
  mint, migrate, and the service-token `/v1/internal/custodian/sign` on the internal router — is
  the live, correct path for those apps and is NOT removed or weakened.
- ADR-0003's **rejection of the env-var static private key for sign/migrate**
  (`signing_controller.rb:47` rejects `auth.source == 'env_var'`) is UNCHANGED and remains
  mandatory for those backend endpoints. This ADR does not touch it.
ADR-0006 adds a SECOND, session-authed door to the same signer for the UI-only case; it does not
close, relax, or replace the first door or any of ADR-0003's key-material rules.

## Consequences

- **Narrow-supersession boundary (CONDITION 4).** ADR-0003's `Status: superseded-by-0006` means
  only that its "no browser-reachable signer" call is revisited for the own-key-signing carve-out.
  ADR-0003's service-token transport for backend sign/migrate and its env-var-key rejection for
  sign/migrate remain authoritative; nothing in this ADR should be read as loosening them. No
  ADR-0007 was written for the retained backend path — restating ADR-0003 would duplicate a fact
  the ADR convention keeps in one home.

- One new browser-reachable route on `auth.foaf.io`. Its blast radius is bounded to the
  authenticated caller's own key by the `sub`-derived signer (CONDITION 1) + the structural
  op-shape allowlist (CONDITION 2), which in v1 admits ONLY the two address-bearing shapes
  `{ updateTrustline, createPendingTransfer }` — every allowlisted signature carries its scope
  (the party addresses) inline in the signed bytes, and the empty-body `confirmTransfer`/
  `rejectTransfer` ops are excluded (422) precisely because they do not. A compromise of one user's
  session signs valid FOAF operations for that user only, never network-wide and never arbitrary
  bytes. This is a strictly smaller surface than the service-token path, whose token signs for
  anyone.

- The new origin(s) (FOAFledger web, OnLoan web) must be added to
  `FOAF_AUTH_ALLOWED_ORIGINS` per tier (the onboarding recipe), and the app registered as a
  `REGISTERED_AUDIENCES` client (`base_controller.rb:18`), before the endpoint is reachable
  cross-origin.

- Deploy is a `foaf-auth` PR to `main` (demo auto-deploys on `service/**`; prod via
  `deploy.yml` dispatch). Per FR-4.6, this ADR must be accepted before the endpoint deploys.

- **Adversarial acceptance gate (AC-14).** The own-key-only guarantee is not merely tested by
  happy path; spec.md AC-14 makes it an explicit acceptance criterion that a valid token for
  identity X can NEVER obtain a signature for identity Y — via crafted signer/address params,
  replayed bodies, or a mismatched/forged `foaf_address` claim. The Challenger and Coder verify
  the endpoint against AC-14 by number.

- The write path is out of the read-only critical path: phases 1–3 (read UI) do not depend on
  this endpoint existing, so it can land after the UI ships.
