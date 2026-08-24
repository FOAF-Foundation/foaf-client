# foaf-client

Shared client SDK for the FOAF ecosystem.

## Package boundary

- `gem/` is the Ruby backend package. It exposes `Foaf::Auth` and `Foaf::Ledger`.
- `client/` is the TypeScript/React Native package. It exposes `auth`, `contacts`,
  `ledger`, `adapters`, and `ui` entry points.
- `contracts/` contains wire fixtures shared by both implementations.

Dependency direction is `ledger -> contacts -> auth`. Auth and contacts must not
depend on ledger code.

## Protocol constraints

- FOAF write signatures are Ethereum `personal_sign` signatures over the exact
  UTF-8 request body sent on the wire.
- Read failures return `nil` in Ruby and throw in TypeScript.
- Mutating transfer calls preserve status and response body.
- `max-capacity-path-info` must include `address` in the JSON body until the
  upstream route/controller parameter mismatch is fixed.
- Balance conversion is pure. Which endpoint the row came from decides whether
  the balance is negated:
  - `userTrustlines(net, myAddress)` rows (`GET .../users/{addr}/trustlines`)
    are ALREADY viewer-oriented — the per-user endpoint applied the viewer's
    frame. So NO negation: `balance` is already the viewer's balance (negative =
    the viewer owes), `received` is the viewer's credit limit, `given` is the
    counterparty's. This is what the read-side hooks and
    `Foaf::Balances.from_user_trustline_row` consume.
  - Raw creditor-oriented `/trustlines` rows are creditor-view, so the debtor's
    viewer balance IS the negated FOAF balance
    (`Foaf::Balances.from_trustline_row`, `viewer_balance = -balance`).
  In both cases `received` is the viewer's credit limit and `given` is the
  counterparty's.

## Tests

Use Docker:

```bash
docker compose run --rm gem
docker compose run --rm client
```

Live FOAF contract tests are opt-in with `INTEGRATION=1`.

