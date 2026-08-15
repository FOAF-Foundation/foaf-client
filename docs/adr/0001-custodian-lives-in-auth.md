# ADR-0001: Shared FOAF custodian lives in auth.foaf.io, not foaf-protocol-ruby
Status: accepted
Date: 2026-08-14

## Context

v1 uses a shared server-side custodian: one signing keypair per `foaf_id`, held by the
shared FOAF spine, signing ledger transactions on request from any app as a peer (custody
model B, resolved grill 2026-08-14). The keypair custody has to live in exactly one of the
two shared-spine services: `auth.foaf.io` (foaf-auth) or `api.foaf.io` (foaf-protocol-ruby).

The tradeoff is a signing-oracle blast radius. Whichever service holds the keys becomes a
honeypot: a full compromise of it means an attacker can sign for every user. So the question
is which trust domain the keys belong in.

## Decision

The custodian lives in **auth.foaf.io (foaf-auth)**. auth already owns the `foaf_id`, issues
the RS256 JWT, and holds the `foaf_id → foaf_address` binding, so co-locating key custody with
identity keeps identity + address + signing authority in one trust domain, authorized by the
same `foaf_id` auth already mints.

foaf-protocol-ruby is explicitly rejected as the host. Its own convention is "the calling app
is the custodial wallet" — it holds zero private keys today (confirmed: no key columns). Making
the credit-truth engine a custodian would be a new, boundary-violating responsibility on the
one service that must stay a pure verifier (FR 14). It verifies signatures via
`SignatureVerifier.verify_by_address` (`app/services/signature_verifier.rb:40-42`); it must not
also produce them.

## Consequences

- The auth **service** bundle needs the `eth` gem added (it has none today) — see ADR-0002's
  sibling note and the plan's Phase 2 B1 step.
- One RCE of auth = total ledger authority. Contained by encrypt-at-rest, internal-only signing,
  per-tier key isolation, and an audit table (see ADR-0003, ADR-0004). Accepted cost of model B.
- Each tier (prod/demo/beta) gets its own custodian store; keys are never shared across tiers.
