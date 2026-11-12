# foaf-client

One installable FOAF SDK per side:

- Ruby gem: auth.foaf.io RS256 verification plus the FOAF ledger client.
- TypeScript package: auth, contacts, ledger, adapters, and React Native UI.
- Python package (`python/`): auth.foaf.io token verification today; contacts,
  ledger and custodian to follow.

The modules stay independently importable:

```ruby
require "foaf/auth"
require "foaf/ledger"
```

```ts
import { FoafAuthClient } from './protocol/foaf-client/auth';
import { FoafContactsClient } from './protocol/foaf-client/contacts';
import { FoafLedgerClient } from './protocol/foaf-client/ledger';
```

The TypeScript source is copy-synced into apps for now. The Ruby artifact is a
normal Bundler dependency.

## Contract rules

- Auth accepts RS256 Bearer tokens only and verifies issuer, audience, JWKS key
  status, identity cutoffs, and revoked JTIs.
- Ledger reads fail safely without collapsing mutating response status/body.
- Signatures are Ethereum `personal_sign` signatures over the exact request
  body.
- The `max-capacity-path-info` `address` workaround is centralized here.
- App domain state machines, Redux, Rails models, and GrowOperative order
  metadata stay outside this package.

See `docs/architecture.md` for the canonical API and `docs/adoption.md` for
consumer sync, Docker, and rollout flags.
