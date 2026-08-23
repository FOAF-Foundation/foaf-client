# Bureau brief — shared contact/ledger UI in foaf-client (the FOAFledger foundation)

**Status:** teed up 2026-08-23. Definition for review BEFORE launching the Bureau. Self-contained
handoff — a session with no prior context can launch the Bureau from it.

**Models:** agent models are governed by the **Bureau's own model policy** — do NOT override them
from this brief (the Conductor runs on Sonnet per that policy, specialists per their policy
assignments). That Robin's launcher session happens to run on Opus says nothing about agent
model choices.

**Where to run:** `~/Code/foaftech` root is recommended — the work spans `foaf-client` (the
deliverable), `foaf-auth` (write-path endpoint, if chosen), `onloan/onloan-app` (first adopter),
and `Growoperative/growoperative-app` (read-only port source now; adoption phase later). If the
run is scoped to SDK-only (phases 1–3 below), `~/Code/foaftech/foaf-client` works. Read
`foaf-client/AGENTS.md` first either way — package boundary, dependency direction
(`ledger -> contacts -> auth`), Docker tests, protocol constraints.

## The goal (Robin's words)

> when i click on a contact it should open up that contact and allow me to record a payment or
> debt and look at the transaction history.. just like growoperative does.. but i want all this
> to be in the foaf-client because this is all the stuff that all the apps will need in common.

> the next app is a contact / wallet only ledger app which allows transactions to be recorded..
> i wanted to make the FOAFledger build go really fast because it would basically be a
> foaf-client only app.. so it would have a default look and feel like growoperative with
> possible overrides for style.

Success = FOAFledger is an Expo shell + foaf-client sync + a theme file: contact list with
balances, contact detail with Pay / Request / Record-debt, transaction history — all shared
components, GrowOperative look as the default theme, per-app style overrides (OnLoan's
warm-ledger proves the override path).

## Current state (verified 2026-08-23)

**foaf-client `client/src/ui/` is a skeleton, not the finished surface.** ContactCard,
CreateTrustlineModal, PaymentModal, PaymentPathView, TrustlineBalancePreview, TrustlineCard,
primitives, theme — 371 lines TOTAL. GrowOperative's real PaymentModal alone is ~1300 lines
(5 actions: pay / float / request / received / i-owe, quick chips, capacity guards, status
microcopy). The port has not happened yet.

**The mature UX lives in growoperative-app (read-only port SOURCE):**
- `src/ui/shared/ProfileContactPrimitives.tsx` — `ContactBalanceRow` (the exact list-row look:
  +$X green-ink "owes me" / −$X red "I owe", tabular-nums, settled rows show nothing)
- `src/ui/shared/SymmetricPixelAvatar.tsx` + `UserAvatar.tsx` — pixel identicon base layer,
  photo overlay (needs `react-native-svg` as a peer dep)
- `src/ui/contacts/ContactFlow.tsx` — contact list modal + detail flow (profile header,
  trustline pill with History link, action buttons, Introduce, recent activity, contact-since)
- `src/ui/trustlines/PaymentModal.tsx`, `TrustlineScreen.tsx`, `TrustlineCard.tsx`,
  `SharedTrustlineCard.tsx` — payment recording + history UX
- Balance sign convention (verified live): FOAF `userTrustlines(net, myAddress)` rows are
  viewer-oriented — `balance > 0` = counterparty owes viewer. railsbackend's `current_balance`
  is the NEGATION. Counterparty key on the wire is `counterParty`; values in display units.
  Network discovery = `networks()[0]` (never hardcode).

**Two bugs to fix upstream in foaf-client (both worked around locally in onloan-app):**
1. `client/src/ledger/FoafLedgerClient.ts:20` — `resolved.fetch ?? globalThis.fetch` loses the
   window binding; every call on web throws `TypeError: Illegal invocation` synchronously (no
   request, invisible failure). Fix: `globalThis.fetch.bind(globalThis)`. OnLoan is the FIRST
   browser consumer of this client — that is why it went unnoticed.
2. `client/src/contacts/types.ts` — `FoafContactEdge` predates the enriched `/v1/contacts`
   envelope (foaf-auth PR #9, live in prod): each edge now carries `user_name`, `display_name`,
   `avatar_url`, `foaf_address` (confirmed contacts only). Add the fields.

**Server side is ready:** auth.foaf.io serves enriched contacts (PR #9) and verifies reads for
any registered audience (PR #6 — multi-audience; refreshed tokens keep their session's `aud`).
foaf-auth deploys via `gh workflow run deploy.yml -f tier=prod -f confirm=deploy-prod-auth`.

**onloan-app divergence to fold back in (extraction candidates, then delete the local copies):**
`app/(app)/contacts.tsx` local `ContactRow` + `contactSinceLabel`, `src/core/foaf/useTrustlineBalances.ts`,
`src/core/foaf/IdentityContext.tsx` local `EnrichedContactEdge` type + `mapContactEdge`, copied
`SymmetricPixelAvatar`/`UserAvatar` in `src/ui/shared/`.

## Deliverables (phased)

**Phase 1 — SDK fixes.** The two bugs above + contract fixtures for the enriched envelope.

**Phase 2 — shared hooks layer** (`client/src/ui/hooks/` or `adapters/`): `useContacts`
(enriched edges → app-facing contact projection), `useTrustlineBalances` (viewer-oriented map by
counterparty address), `useTrustlineEvents` (history for one counterparty), `useViewerTrustline`
(single-trustline pill data). Framework-light, storage/client injected, no app imports.

**Phase 3 — the UI port** (the bulk): themable versions of GrowOperative's components in
`client/src/ui/`, GrowOp look as DEFAULT theme via `FoafUiTheme` (extend tokens as needed —
identicon palettes, balance colors, fonts):
- `ContactBalanceRow` + `UserAvatar`/`SymmetricPixelAvatar`
- `ContactListScreen` (search, phone-width max ~430px centered on desktop/web — the list must
  render well on web, this was an explicit complaint)
- `ContactDetailScreen` — profile header (avatar, name, @handle), trustline pill (balance +
  direction + History), action buttons (Pay / Request / I Owe More), recent activity list,
  contact-since row
- `PaymentModal` at GrowOp parity (all 5 actions, chips, capacity guards, status copy)
- History/activity view (trustline events, +/− amounts, relative dates)
- Web + native parity for every component; `react-native-svg` peer dependency documented
- Theme-override documentation with OnLoan warm-ledger as the worked example

**Phase 4 — the write path (OPEN DECISION, see below).** Recording a payment/debt must produce
a signed ledger operation. Read-only phases 1–3 do NOT block on this.

**Phase 5 — OnLoan adoption.** Re-sync mirrors (`client/scripts/sync-to-app.sh`), replace the
local ContactRow/hooks/types with the shared ones, wire ContactDetail + recording, keep the
warm-ledger theme. Deploy = local build + `wrangler pages deploy` (CF Pages git integration is
broken; do NOT assume push-to-deploy).

**Phase 6 — GrowOperative adoption (separate, later).** GrowOp swaps its local components for
the foaf-client ones. **Hard requirement from Robin: this ships through the full tier path
beta → demo → prod** — verified working at each tier before promoting. Never straight to prod.

## The write-path decision (resolve in planning, before Phase 4)

ADR-0003 (accepted 2026-08-14) explicitly REJECTED an internet-facing signing oracle: custodian
sign/migrate are internal, service_tokens-table-only endpoints; apps' BACKENDS call them (that is
what the gem's `RemoteSignatureProvider` is for — GrowOp signs via railsbackend, OnLoan via
onloan-api). A backend-less FOAFledger has nothing to hold a service token. Options:

- **(a) Revisit ADR-0003 with a Bearer-authed sign-for-self endpoint** on auth.foaf.io: the
  user's session authorizes signing with the user's OWN custodial key only. Preserves "foaf-client
  only app" literally. Needs: strict rack-attack throttles, `body_sha256` audit (ADR-0003's
  forensics), payload allowlisting (only ledger-operation shapes), and an explicit ADR
  superseding note.
- **(b) One shared thin "wallet write" service** holding a service token — generalizes the
  railsbackend pattern; every UI-only app points at it. Keeps ADR-0003 intact but adds a
  deployable; functionally still exposes user-intent→signature on the internet, just one hop out.
- **(c) FOAFledger gets its own thin backend** (onloan-api pattern). Least new design, most
  boilerplate per future app; contradicts "foaf-client only".

Note (a) and (b) differ mostly in WHERE the session-check lives, not in attack surface. The
security invariants that matter: session-authorized, own-key-only, throttled, body-hash audited.
The plan phase should pick one and write the ADR.

## Constraints

- **Agent models follow the Bureau's model policy** (Conductor on Sonnet; specialists per policy).
  This brief must not override them. Robin launches from his own fresh session; this brief is the
  handoff.
- growoperative-app is a READ-ONLY port source in phases 1–5. Its own adoption (phase 6) is the
  only time it changes, and then only via beta → demo → prod.
- App mirrors (`src/protocol/foaf-client/` in apps) are copy-synced via
  `client/scripts/sync-to-app.sh` — never hand-edited. Phase 5 must resync, not patch.
- foaf-client conventions per `AGENTS.md`: dependency direction `ledger -> contacts -> auth`
  (ui may depend on all three; nothing depends on ui), Docker tests, wire contracts in
  `contracts/` shared by gem + client.
- No money math in apps or UI components: display formatting only; amounts come from FOAF.
- foaf-auth changes go via PR to main (guardrail) and deploy through `deploy.yml`
  (demo auto-deploys on merge; prod = dispatch with confirm).
- OnLoan deploys via wrangler direct upload until CF Pages git integration is reconnected.

## Acceptance

1. A new Expo app can present: themed contact list with balances, contact detail, record
   payment/debt (once Phase 4 lands), and history — importing only from foaf-client + a theme
   file. That app IS the FOAFledger skeleton.
2. OnLoan runs the shared components with its warm-ledger theme, local copies deleted.
3. Default theme is visually GrowOperative (side-by-side screenshot check against
   GrowOp's contact modal + contact detail).
4. Gem + client Docker test suites and contract fixtures pass; onloan-app tsc/jest pass after
   resync.
5. Every component renders correctly on BOTH web (Chrome, desktop width) and native.
