# Bureau brief — one foaf_address per identity across all FOAF apps

**Status:** teed up 2026-08-14 for a Bureau run. Robin runs this from a fresh session. Self-contained handoff — a session with no prior context can launch the Bureau from it.

This is now the *documented* architecture, not just a proposal: `~/Code/foaftech/CLAUDE.md` § "FOAF is the spine" states trustlines are shared (a debt between two users is **one** trustline in FOAF; a repayment via any app reconciles it for all), and the `foaf-auth` entry names the exact open gap — *"foaf_address is not yet on the identity — needed so apps read the ledger address from the session; in progress 2026-08."* This brief is the design+migration work to close that gap.

## How to launch (fresh session)

From a Growoperative (or foaftech) session, trigger the Bureau (`get the bureau on it`) and point it at this brief. The Orchestrator should read `~/Code/novadiem/bureau/CLAUDE.md` + `agents/orchestrator.md`, triage against `workflows/index.md`, and run the right-sized workflow. This is a **design + migration-plan** task (architecture with an independent critic), not a blind build. Load the `foaf-protocol` skill before touching protocol boundaries.

## The goal (Robin's words)

> One foaf_address in all the apps. Someone should be able to owe me money from one app and pay me back through the other, without talking to GrowOperative about it.

One identity = one ledger node, everywhere. Debt incurred in App A is repayable from App B, with no app being a required intermediary for another. This is exactly the workspace guide's "trustlines are shared" principle — currently unenforced at the identity↔address layer.

## Why it doesn't work today (verified 2026-08-14, two code agents)

Three separate namespaces, bound only inside each app:

1. **auth.foaf.io is identity-only.** `identities.foaf_id` = a `SecureRandom.uuid` (`foaf-auth/service/app/models/identity.rb`). JWT carries `sub = foaf_id` + `user_name` (`jwt_issuer.rb`). **No** foaf_address / wallet / pubkey column anywhere in auth. (Auth's own audit doc calls foaf_address "the existing on-chain wallet column" living in the *Growoperative* DB.)
2. **The foaf_id → foaf_address binding lives per-app, in each app's `users` table.** railsbackend `users` holds both `foaf_id` (UUID from auth, migration `20260503120000`) and `foaf_address` (42-char string, unique, migration `20260415120000_add_foaf_identity_to_users`, + `foaf_public_key`). Request auth resolves `User.find_by(foaf_id: sub)` (`Growoperative/railsbackend/app/controllers/api/v1/api_controller.rb:~204`).
3. **The protocol ledger keys on the ADDRESS, not the identity.** foaf-protocol-ruby trustlines are keyed by `user_a_address` / `user_b_address` (42-char strings, canonical order `a<b`), unique on `(currency_network_id, user_a_address, user_b_address)` (`trustline_record.rb`, `create_trustlines` migration).

The two concrete blockers:

- **Resolution is owned by GrowOperative.** OnLoan resolves `foaf_id → foaf_address` by reading **railsbackend's MySQL directly** (`~/Code/foaftech/docs/foaf-client/spec.md:121`; `onloan-api` `borrower_address_resolver.rb`). That literally is "talking to GrowOperative" — the anti-pattern the workspace guide now explicitly calls out as corrected/to-avoid. `~/Code/foaftech/docs/foaf-client/plan.md:64` flags killing that read but leaves the replacement owner unspecified.
- **Key custody is per-app and split two ways.** GrowOp mints the keypair server-side via the FOAF API and stores it on the `users` row (backend custody, server signs — `railsbackend/app/services/foaf/signer.rb`). OnLoan holds the keypair in the user's **device secure-store** (expo-secure-store), signs client-side, direct-to-FOAF (`~/Code/foaftech/docs/foaf-client/spec.md:53-57,142`). Same person on two apps = two keypairs = two addresses = two unrelated ledger nodes.

**Net:** foaf-client as currently specced shares the client *code* but does not make the identity↔address binding shared. Each app still mints its own per-user keypair. That's the gap.

## Chosen direction (Robin, 2026-08-14)

- **The shared layer becomes the source of truth for `foaf_id → foaf_address`.** Owner is almost certainly **auth.foaf.io** (it already owns `foaf_id` and the social graph; the workspace guide already frames the address as belonging "on the identity … read from the session"). Every app resolves via foaf-client's `auth` module, never via any app's DB.
- **Edit foaf-client to handle this**, then **make GrowOperative read the binding there instead of holding it privately.** GrowOp's private `users.foaf_address` custody is the outlier to retire.

## The open decision the Bureau must settle: key custody

- **(A) User/device-held key** (OnLoan model, extended to all apps). One key per identity on the user's device; auth owns `foaf_id → public address`; no app and not even the shared server is a required middleman. The only model where "without talking to GrowOperative" is literally true. **Robin's lean.** Costs to design: migrate GrowOp off server-custody; a **web custody** story (no expo-secure-store on web) and a **key-recovery** story (device loss must not lose someone's credit identity/history).
- **(B) Shared custodian** at auth or the protocol — holds one keypair per `foaf_id`, signs on request; apps just call it. Simplest for apps and easiest migration, but re-centralizes (moves the dependency from GrowOp to auth) and makes that server a key honeypot / signing oracle.

Decide A vs B with a real security analysis, not by assumption.

## Deliverables the Bureau should produce

1. **Design:** where the `foaf_id → address` map lives, the chosen custody model (A/B) with security rationale, how minting-once-per-identity works, and the foaf-client API changes (`auth` module resolves address; `ledger`/`signer` gets its key from the shared custody source, not the app's `users` row).
2. **Migration plan for GrowOperative** — it has **live users with server-side addresses today**. Either migrate them to the chosen model or have auth adopt the existing addresses as canonical. Reads-first, checkpoint before mutating transfers (mirrors the roadmap's "GrowOp migrates last, invasive, reads-first").
3. **Wire-contract safety:** signatures must still be accepted by FOAF (`signature_enforcement=true`); pin the round-trip (Ruby + TS signers → FOAF `personal_recover`). See `~/Code/foaftech/docs/foaf-client/DIRECTION.md` §C.
4. **Kill the cross-app MySQL read** (`borrower_address_resolver`) and replace it with the shared resolution path.

## Constraints / non-negotiables

- Respect the **foaf-protocol boundary / portability rules** — load the `foaf-protocol` skill. The protocol (`foaf-protocol-ruby`, renaming → foaf-credit) is the credit truth; Rails services are relays.
- **Apps never call each other's APIs** and never hold shared auth/social/credit data — only their own product data. FOAF is the spine; every app is a peer client of it (workspace guide § "FOAF is the spine").
- **railsbackend is NOT retiring** (kept/modernized) — the "retiring" note in some docs is stale.
- Sequence within the **consolidation roadmap** (`~/Code/foaftech/docs/roadmap.md`): version-unify → foaf-client → Postgres → Contabo. This is part of Phase 2 (foaf-client) — the identity↔address binding the current spec left open.
- GrowOp is the one **invasive live migration** and goes last; OnLoan (no users) is the seed/first port.

## Pointers

- This repo's own docs: `../architecture.md`, `../adoption.md`.
- Planning docs (separate tree): `~/Code/foaftech/docs/foaf-client/DIRECTION.md` (authoritative packaging decision), `plan.md`, `spec.md`; roadmap `~/Code/foaftech/docs/roadmap.md`.
- Authoritative architecture framing: `~/Code/foaftech/CLAUDE.md` §§ "FOAF is the spine", "Onboarding an app to auth.foaf.io".
- Findings + citations: Claude memory `reference_foaf_id_to_address_linkage` (Growoperative memory dir).
- Repos in scope: `foaf-auth`, `foaf-protocol-ruby`, `Growoperative/railsbackend`, `onloan` (`onloan-api` / `onloan-app`), and `foaf-client` (this repo).
- Target repo for the `.bureau/runs/` record: Orchestrator's call — likely `foaf-client` (this repo) or `foaf-auth`, since the change centers on the shared identity layer.
