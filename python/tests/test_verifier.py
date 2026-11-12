"""Mirrors gem/spec/foaf/auth/verifier_spec.rb, plus the rejection cases a
Python consumer most needs pinned (audience, issuer, expiry, forged key)."""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from foaf_client.auth import (
    FetchError,
    RevokedTokenError,
    UnknownKidError,
    VerificationError,
    Verifier,
)

ISSUER = "auth.foaf.io"
AUDIENCE = "test-app"
KID = "kid-1"


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def _new_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


SIGNING_KEY = _new_key()


class FakeAuth:
    """Stands in for auth.foaf.io's JWKS and revocation snapshot endpoints."""

    def __init__(self) -> None:
        self.now = time.time()
        jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(SIGNING_KEY.public_key()))
        jwk.update({"kid": KID, "alg": "RS256", "use": "sig"})
        self.jwk_keys = [jwk]
        self.snapshot_overrides: dict = {}
        self.calls: list[tuple[str, dict]] = []
        self.fail_jwks = False
        self.fail_snapshot = False

    def http_get(self, url: str, headers):
        self.calls.append((url, dict(headers)))
        if "jwks" in url:
            if self.fail_jwks:
                raise FetchError("HTTP 503 fetching /.well-known/jwks.json")
            return json.dumps({"keys": self.jwk_keys})
        if self.fail_snapshot:
            raise FetchError("HTTP 503 fetching /v1/revocations/snapshot")
        body = {
            "generated_at": _iso(self.now),
            "audience": AUDIENCE,
            "revoked_jtis": [],
            "tokens_invalid_before": {},
            "revoked_kids": [],
        }
        body.update(self.snapshot_overrides)
        return json.dumps(body)

    def verifier(self, **kwargs) -> Verifier:
        return Verifier(
            jwks_url="https://auth.test/.well-known/jwks.json",
            issuer=ISSUER,
            audience=AUDIENCE,
            revocations_url="https://auth.test/v1/revocations/snapshot",
            service_token="service-secret",
            http_get=self.http_get,
            clock=lambda: self.now,
            **kwargs,
        )


@pytest.fixture
def auth() -> FakeAuth:
    return FakeAuth()


def token(extra: dict | None = None, *, key=SIGNING_KEY, kid=KID, **overrides) -> str:
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "sub": "foaf-id-1",
        "iat": now,
        "exp": now + 3600,
        "jti": "jti-1",
        "user_name": "member",
    }
    claims.update(overrides)
    claims.update(extra or {})
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": kid})


def test_verifies_issuer_audience_signature_and_sends_service_bearer(auth):
    claims = auth.verifier().verify(f"Bearer {token()}", request_id="request-1")

    assert claims["sub"] == "foaf-id-1"
    snapshot_url, snapshot_headers = next(c for c in auth.calls if "revocations" in c[0])
    assert "audience=test-app" in snapshot_url
    assert snapshot_headers["Authorization"] == "Bearer service-secret"
    assert all(h.get("X-Request-ID") == "request-1" for _, h in auth.calls)


def test_rejects_non_rs256_tokens(auth):
    hs = jwt.encode(
        {"sub": "foaf-id-1", "exp": int(time.time()) + 3600}, "secret" * 6, algorithm="HS256"
    )
    with pytest.raises(VerificationError, match="only RS256"):
        auth.verifier().verify(hs)


def test_rejects_unsigned_alg_none(auth):
    unsigned = jwt.encode({"sub": "foaf-id-1"}, None, algorithm="none")
    with pytest.raises(VerificationError, match="only RS256"):
        auth.verifier().verify(unsigned)


def test_rejects_garbage_and_empty(auth):
    with pytest.raises(VerificationError):
        auth.verifier().verify("not-a-jwt")
    with pytest.raises(VerificationError, match="required"):
        auth.verifier().verify("Bearer ")


def test_rejects_revoked_signing_keys(auth):
    auth.snapshot_overrides["revoked_kids"] = [{"kid": KID, "retired_at": _iso(auth.now)}]
    with pytest.raises(RevokedTokenError, match="signing key"):
        auth.verifier().verify(token())


def test_rejects_identity_cutoffs_and_revoked_jtis(auth):
    auth.snapshot_overrides["tokens_invalid_before"] = {"foaf-id-1": _iso(auth.now + 10)}
    with pytest.raises(RevokedTokenError, match="identity cutoff"):
        auth.verifier().verify(token())

    del auth.snapshot_overrides["tokens_invalid_before"]
    auth.snapshot_overrides["revoked_jtis"] = [{"jti": "jti-1", "exp": _iso(auth.now + 3600)}]
    with pytest.raises(RevokedTokenError, match="has been revoked"):
        auth.verifier().verify(token())


def test_expired_jti_revocation_no_longer_applies(auth):
    auth.snapshot_overrides["revoked_jtis"] = [{"jti": "jti-1", "exp": _iso(auth.now - 1)}]
    assert auth.verifier().verify(token())["jti"] == "jti-1"


def test_fails_closed_for_an_unknown_kid_and_negative_caches_it(auth):
    auth.jwk_keys.clear()
    verifier = auth.verifier()
    with pytest.raises(UnknownKidError, match="unknown"):
        verifier.verify(token())
    jwks_calls = sum(1 for url, _ in auth.calls if "jwks" in url)
    with pytest.raises(UnknownKidError, match="negative-cached"):
        verifier.verify(token())
    assert sum(1 for url, _ in auth.calls if "jwks" in url) == jwks_calls


def test_rejects_a_token_signed_by_another_key_under_the_same_kid(auth):
    with pytest.raises(VerificationError, match="Signature"):
        auth.verifier().verify(token(key=_new_key()))


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"aud": "growoperative"}, "(?i)audience"),
        ({"iss": "evil.example"}, "(?i)issuer"),
        ({"exp": int(time.time()) - 3600}, "(?i)expired"),
    ],
)
def test_rejects_wrong_audience_issuer_and_expired(auth, overrides, message):
    with pytest.raises(VerificationError, match=message):
        auth.verifier().verify(token(**overrides))


def test_requires_exp(auth):
    now = int(time.time())
    no_exp = jwt.encode(
        {"iss": ISSUER, "aud": AUDIENCE, "sub": "foaf-id-1", "iat": now},
        SIGNING_KEY,
        algorithm="RS256",
        headers={"kid": KID},
    )
    with pytest.raises(VerificationError, match="exp"):
        auth.verifier().verify(no_exp)


def test_uses_last_good_jwks_when_auth_is_down(auth):
    verifier = auth.verifier(jwks_ttl=60)
    verifier.verify(token())
    auth.fail_jwks = True
    auth.now += 120  # past the TTL, inside the last-good window
    assert verifier.verify(token())["sub"] == "foaf-id-1"


def test_jwks_outage_beyond_last_good_window_raises_fetch_error(auth):
    verifier = auth.verifier(jwks_ttl=60, last_good_jwks_age=300)
    verifier.verify(token())
    auth.fail_jwks = True
    auth.now += 600
    with pytest.raises(FetchError):
        verifier.verify(token())


def test_without_any_snapshot_revocations_are_not_enforced(auth):
    # Same rule as the gem: no snapshot ever fetched means no revocation check.
    auth.fail_snapshot = True
    assert auth.verifier().verify(token())["sub"] == "foaf-id-1"


def test_keeps_the_last_snapshot_when_a_refresh_fails(auth):
    auth.snapshot_overrides["revoked_jtis"] = [{"jti": "jti-1", "exp": _iso(auth.now + 3600)}]
    verifier = auth.verifier(revocations_ttl=60)
    with pytest.raises(RevokedTokenError):
        verifier.verify(token())
    auth.fail_snapshot = True
    auth.now += 120
    with pytest.raises(RevokedTokenError):
        verifier.verify(token())


def test_ignores_a_snapshot_for_another_audience(auth):
    auth.snapshot_overrides["audience"] = "someone-else"
    auth.snapshot_overrides["revoked_jtis"] = [{"jti": "jti-1", "exp": _iso(auth.now + 3600)}]
    assert auth.verifier().verify(token())["sub"] == "foaf-id-1"


def test_surfaces_foaf_address_when_present_and_omits_it_when_absent(auth):
    address = "0x1111111111111111111111111111111111111111"
    assert auth.verifier().verify(token({"foaf_address": address}))["foaf_address"] == address
    assert "foaf_address" not in auth.verifier().verify(token())


def test_for_auth_base_url_builds_the_tier_urls():
    calls = []

    def http_get(url, headers):
        calls.append(url)
        raise FetchError("offline")

    v = Verifier.for_auth_base_url(
        "https://bauth.foaf.io/", audience="neotribes", http_get=http_get
    )
    with pytest.raises(FetchError):
        v.verify(token(aud="neotribes"))
    assert "https://bauth.foaf.io/v1/revocations/snapshot?audience=neotribes" in calls
    assert "https://bauth.foaf.io/.well-known/jwks.json" in calls


class FlakyTransport(FakeAuth):
    """An injected http_get that fails with a non-FetchError, like httpx or a socket."""

    def __init__(self) -> None:
        super().__init__()
        self.raise_on: str | None = None

    def http_get(self, url, headers):
        if self.raise_on and self.raise_on in url:
            raise ConnectionError("connection reset")
        return super().http_get(url, headers)


def test_transport_errors_on_snapshot_keep_the_last_snapshot():
    auth = FlakyTransport()
    auth.snapshot_overrides["revoked_jtis"] = [{"jti": "jti-1", "exp": _iso(auth.now + 3600)}]
    verifier = auth.verifier(revocations_ttl=60)
    with pytest.raises(RevokedTokenError):
        verifier.verify(token())
    auth.raise_on = "revocations"
    auth.now += 120
    with pytest.raises(RevokedTokenError):
        verifier.verify(token())


def test_transport_errors_on_jwks_use_the_last_good_key():
    auth = FlakyTransport()
    verifier = auth.verifier(jwks_ttl=60)
    verifier.verify(token())
    auth.raise_on = "jwks"
    auth.now += 120
    assert verifier.verify(token())["sub"] == "foaf-id-1"


def test_transport_errors_with_no_cache_surface_as_fetch_error():
    auth = FlakyTransport()
    auth.raise_on = "jwks"
    with pytest.raises(FetchError):
        auth.verifier().verify(token())


def test_future_iat_is_accepted_like_the_gem(auth):
    assert auth.verifier().verify(token(iat=int(time.time()) + 60))["sub"] == "foaf-id-1"
