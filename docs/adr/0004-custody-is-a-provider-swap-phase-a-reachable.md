# ADR-0004: v1 server-side custody is a signature_provider swap; Phase A device custody reachable without re-key
Status: accepted
Date: 2026-08-14

## Context

The grill deferred device-held keys (custody model A) to a future phase because users are few,
non-technical, and must not lose ledger access to key loss. v1 is server-side custody (model B).
The risk is locking the data model into server custody so that Phase A becomes a migration
nightmare — worst case, a re-key of every live trustline.

## Decision

Treat v1 custody as a **`signature_provider` choice, not a data-model fact**. The SDK already
abstracts signing behind a provider seam (`Foaf::LedgerClient.new(signature_provider:)`;
TS `createPrivateKeySignatureProvider`). v1 adds a remote-custodian provider that calls the
internal signing endpoint. `foaf_address` on the identity is the immutable source of truth for
the `foaf_id → address` binding.

Because the address is immutable and signing is behind a provider, Phase A (device-held) is a
**provider-implementation swap with no re-key and no ledger-node change** — the private key moves
onto the device, the address stays, foaf-auth keeps the `foaf_id → foaf_address` mapping but drops
the private key. This is the honeypot's exit ramp.

## Consequences

- The GrowOp migration adopts existing addresses as canonical and never mints a new keypair for a
  live user (FR 9) — the migrate endpoint ADOPTS, it does not re-key.
- Phase A is named, not built; web custody needs its own story (no expo-secure-store on web).
