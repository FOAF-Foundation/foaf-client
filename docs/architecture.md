# Architecture

`foaf-client` contains two artifacts in one repository because they encode the
same FOAF wire contract.

## Ruby

```ruby
verifier = Foaf::Auth::Verifier.new(
  jwks_url: "https://auth.foaf.io/.well-known/jwks.json",
  issuer: "auth.foaf.io",
  audience: "my-app",
  revocations_url: "https://auth.foaf.io/v1/revocations/snapshot",
  service_token: ENV.fetch("FOAF_AUTH_SERVICE_TOKEN")
)
claims = verifier.verify(token)

client = Foaf::LedgerClient.new(base_url: "https://api.foaf.io")
network = client.network(network_address: address)
```

Apps that hold FOAF private keys may inject a signature provider:

```ruby
keys = { wallet_address.downcase => private_key_hex }
client = Foaf::LedgerClient.new(
  base_url: "https://api.foaf.io",
  signature_provider: lambda do |actor_address, exact_body|
    Foaf::LedgerSigner.sign!(keys.fetch(actor_address.downcase), exact_body)
  end
)
```

The provider receives the actor address and the exact JSON body that will be
sent. Confirmation and rejection calls also require `signer_address:` when
signature enforcement is enabled because the pending-transfer ID alone does
not reveal the receiver to the client.

### Remote custodian signing (v1 default)

Apps should NOT hold FOAF private keys in v1. The shared custodian holds one
key per identity and signs on request, so the same `signature_provider` seam
routes to HTTPS instead of a local key. The app-level ledger API is unchanged:

```ruby
client = Foaf::LedgerClient.new(
  base_url: "https://api.foaf.io",
  signature_provider: Foaf::Custodian.remote_provider(
    base_url: "https://auth.foaf.io",
    service_token: ENV.fetch("FOAF_AUTH_SERVICE_TOKEN"),
    foaf_id: identity.foaf_id
  )
)
```

`Foaf::Custodian::RemoteSignatureProvider` (and the `remote_provider` lambda
above) call `POST /v1/internal/custodian/sign` with
`{ foaf_id:, exact_body: }` and a `Authorization: Bearer <service_token>`
header, and return the `signature` from the response. A non-200 or a network
failure raises `Foaf::Custodian::SigningError` — there is no fallback to a
local key (EC 5), so a signing outage surfaces rather than silently degrading.

> **Cross-language note (signing path, 404):** the Ruby signing provider raises
> `SigningError` on *any* non-200, including a 404 — it never returns a nil
> signature. The TypeScript `createRemoteCustodianSignatureProvider` returns
> `null` only on an explicit 404 "no key" (and throws on 5xx/network). So the two
> signing providers deliberately differ on 404: Ruby raises, TS returns null. An
> app wiring both should handle each accordingly. (The counterparty *resolvers*,
> by contrast, agree: both return nil/null on 404 and raise/throw on 5xx.)

### Counterparty-address resolution

Never trust a client-supplied wallet address for a payment target. Resolve the
counterparty's canonical address from auth's `foaf_id → foaf_address` binding:

```ruby
resolver = Foaf::Custodian::AddressResolver.new(
  base_url: "https://auth.foaf.io",
  service_token: ENV.fetch("FOAF_AUTH_SERVICE_TOKEN")
)
address = resolver.address_for(counterparty_foaf_id) # 0x… or nil
```

`address_for` calls `GET /v1/internal/identities/:foaf_id/foaf_address` and
returns the `foaf_address` on 200, `nil` on 404 (no wallet minted yet), and
raises `Foaf::Custodian::ResolutionError` on a 5xx or network failure — a
lookup failure is never downgraded to "no address" (EC 5).

## TypeScript

The package modules are independently importable, but all are delivered by the
same copy-sync:

- `auth`: auth.foaf.io lifecycle client and response mapping.
- `contacts`: canonical FOAF contact-edge reads.
- `ledger`: FOAF networks, trustlines, capacity, transfers, key custody,
  signing, and balance conversion.
- `adapters`: headless data-source boundary for direct FOAF and Rails `/v1`.
- `ui`: controlled React Native components; no Redux or app API singleton.

The direct adapter intentionally provides ledger primitives, not app settlement
policy. Loan/order state transitions remain in their owning apps.

### Remote custodian signing (TypeScript)

The TS side mirrors the Ruby remote provider. `ledger.createRemoteCustodianSignatureProvider`
returns the same `FoafSignatureProvider` shape as the local-key provider, so
the ledger client API is unchanged (FR 13):

```ts
const client = new FoafLedgerClient({
  baseUrl: 'https://api.foaf.io',
  signatureProvider: createRemoteCustodianSignatureProvider(
    fetch,
    'https://auth.foaf.io',
    serviceToken,
    identity.foafId,
  ),
});
```

It posts to `POST /v1/internal/custodian/sign` with `{ foaf_id, exact_body }`
and a Bearer service token, and returns the `signature`. A 5xx or network
failure throws; only an explicit "no key" 404 returns `null` (EC 5 — never a
local-key fallback).

### Counterparty-address resolution (TypeScript)

`auth.resolveFoafAddress(fetch, baseUrl, serviceToken, foafId)` calls
`GET /v1/internal/identities/:foafId/foaf_address` and returns the address on
200, `null` on 404 (no wallet yet), and throws on a 5xx.
