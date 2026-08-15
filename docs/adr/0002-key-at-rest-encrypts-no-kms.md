# ADR-0002: Custodian key-at-rest via Rails `encrypts`, no external KMS in v1
Status: accepted
Date: 2026-08-14

## Context

The custodian stores one secp256k1 private key per `foaf_id` server-side. Keys must be
encrypted at rest so a DB-only breach (SQL injection, stolen dump, backup theft — the common
case) yields ciphertext, not keys. Options: Rails native Active Record Encryption, an
`attr_encrypted`/`lockbox` gem, or AES envelope encryption with a KMS-managed DEK.

foaf-auth has no encryption machinery today (no `attr_encrypted`/`lockbox`/`aws-sdk-kms` in
`service/Gemfile`).

## Decision

Use **Rails native `encrypts`** (Active Record Encryption, non-deterministic) on the
`identities.foaf_encrypted_private_key` column. No new gem, no KMS dependency for v1. Encryption
keys (`primary_key`, `deterministic_key`, `key_derivation_salt`) come from Rails credentials/env,
provisioned per tier.

KMS is deliberately excluded from v1: it adds a hard runtime dependency and key-rotation
operational surface for a system with few users, and the `encrypts` path is reversible to a
KMS-backed scheme later without a data-model change.

## Consequences

- A full app-level RCE (keys decryptable in process memory) is NOT mitigated by this — that is
  R1's residual risk, addressed by internal-only signing (ADR-0003) and the Phase-A exit ramp
  (ADR-0004), not by at-rest encryption.
- The ciphertext is base64 ASCII, safe in the `identities` latin1 charset.
