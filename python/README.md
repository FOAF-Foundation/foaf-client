# foaf-client (Python)

Python client for the FOAF protocol, alongside the Ruby gem (`../gem`) and the TypeScript package (`../client`). All three encode the same wire contract.

This first release covers auth: verifying auth.foaf.io bearer tokens in a Python backend. Contacts, ledger, signing and the custodian follow, held to the shared fixtures in `../contracts`.

## Install

From the repository until it is published:

```bash
uv add "foaf-client @ git+https://github.com/FOAF-Foundation/foaf-client#subdirectory=python"
```

## Verify a token

```python
from foaf_client.auth import Verifier, VerificationError, FetchError

verifier = Verifier.for_auth_base_url(
    "https://auth.foaf.io",          # bauth.foaf.io for beta, dauth.foaf.io for demo
    audience="my-app",               # your registered client_id
    service_token=os.environ["FOAF_AUTH_SERVICE_TOKEN"],
)

try:
    claims = verifier.verify(request.headers["Authorization"])
except VerificationError:
    ...  # 401: bad, expired, wrong audience, or revoked token
except FetchError:
    ...  # 503: auth's JWKS unreachable and no last-good key
```

`claims["sub"]` is the FOAF id, `claims["user_name"]` the handle, and `claims.get("foaf_address")` the ledger address (absent until a wallet is minted).

What it checks, same as `Foaf::Auth::Verifier` in the gem:

- RS256 only; the key comes from auth's JWKS by `kid`, cached with a last-good fallback and a negative cache for unknown kids.
- Issuer and audience, with 30 seconds of clock skew.
- The audience's revocation snapshot, fetched with your service token: revoked signing keys, per-identity cutoffs (log out everywhere), revoked token ids (log out).
- If no snapshot has ever been fetched, revocations are not enforced; a failed refresh keeps the last snapshot.

The Python verifier also requires `exp`, `iat`, `sub`, `iss` and `aud` to be present. auth.foaf.io always sets them.

## Develop

```bash
cd python
uv sync
uv run pytest
uv run ruff check src tests && uv run ruff format --check src tests
```

Or with Docker from the repository root: `docker compose run --rm python`.
