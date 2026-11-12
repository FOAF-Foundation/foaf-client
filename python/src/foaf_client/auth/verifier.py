from __future__ import annotations

import re
import time
from collections.abc import Callable
from typing import Any

import jwt

from foaf_client.auth.errors import Error, RevokedTokenError, VerificationError
from foaf_client.auth.http import HttpGet, urllib_get
from foaf_client.auth.jwks_cache import JwksCache
from foaf_client.auth.revocations import RevocationCache, RevocationSnapshot

RS256 = "RS256"
_BEARER = re.compile(r"\ABearer\s+", re.IGNORECASE)


class Verifier:
    """Verifies auth.foaf.io bearer tokens for one audience.

    Parity with `Foaf::Auth::Verifier`: RS256 only; issuer and audience
    checked; the signing key comes from the JWKS by kid; then the audience's
    revocation snapshot is applied (revoked signing keys, per-identity
    cutoffs, revoked JTIs). Returns the decoded claims as a dict.
    `claims.get("foaf_address")` is the identity's ledger address, absent
    (not None-valued) until a wallet is minted.

    One difference from the gem: `exp`, `iat`, `sub`, `iss` and `aud` must be
    present. auth.foaf.io always issues them, so this only rejects tokens it
    never makes.
    """

    def __init__(
        self,
        *,
        jwks_url: str,
        issuer: str,
        audience: str,
        revocations_url: str,
        service_token: str | None = None,
        jwks_ttl: float = 300,
        revocations_ttl: float = 300,
        last_good_jwks_age: float = 86_400,
        negative_kid_ttl: float = 30,
        stale_revocations_after: float = 900,
        clock_skew: float = 30,
        http_get: HttpGet | None = None,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self._issuer = issuer
        self._audience = audience
        self._clock_skew = clock_skew
        self._clock = clock or time.time
        fetcher = http_get or urllib_get
        self._jwks = JwksCache(
            url=jwks_url,
            http_get=fetcher,
            ttl=jwks_ttl,
            last_good_max_age=last_good_jwks_age,
            negative_ttl=negative_kid_ttl,
            clock=self._clock,
        )
        self._revocations = RevocationCache(
            url=revocations_url,
            audience=audience,
            service_token=service_token,
            http_get=fetcher,
            ttl=revocations_ttl,
            stale_alert_after=stale_revocations_after,
            clock=self._clock,
        )

    @classmethod
    def for_auth_base_url(
        cls, base_url: str, *, audience: str, issuer: str = "auth.foaf.io", **kwargs: Any
    ) -> Verifier:
        """Build a verifier from an auth tier's base URL, e.g. https://bauth.foaf.io."""
        root = base_url.rstrip("/")
        return cls(
            jwks_url=f"{root}/.well-known/jwks.json",
            revocations_url=f"{root}/v1/revocations/snapshot",
            issuer=issuer,
            audience=audience,
            **kwargs,
        )

    def verify(self, bearer_token: str | None, request_id: str | None = None) -> dict[str, Any]:
        token = _BEARER.sub("", str(bearer_token or ""), count=1).strip()
        if not token:
            raise VerificationError("token is required")
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") != RS256:
                raise VerificationError("only RS256 auth tokens are accepted")

            kid = str(header.get("kid") or "")
            snapshot = self._revocations.current(request_id=request_id)
            if snapshot is not None and snapshot.revoked_kid(kid):
                raise RevokedTokenError("JWT signing key has been revoked")

            public_key = self._jwks.public_key_for(kid, request_id=request_id)
            claims = jwt.decode(
                token,
                public_key,
                algorithms=[RS256],
                audience=self._audience,
                issuer=self._issuer,
                leeway=self._clock_skew,
                options={"require": ["exp", "iat", "sub", "iss", "aud"]},
            )
        except Error:
            raise
        except jwt.PyJWTError as e:
            raise VerificationError(str(e)) from e
        self._enforce_revocations(claims, snapshot)
        return claims

    def refresh(self, request_id: str | None = None) -> None:
        self._jwks.refresh(request_id=request_id)
        self._revocations.refresh(request_id=request_id)

    def _enforce_revocations(
        self, claims: dict[str, Any], snapshot: RevocationSnapshot | None
    ) -> None:
        if snapshot is None:
            return
        cutoff = snapshot.cutoff_for(str(claims.get("sub")))
        try:
            issued_at = int(claims.get("iat") or 0)
        except (TypeError, ValueError):
            issued_at = 0
        if cutoff is not None and issued_at > 0 and issued_at < int(cutoff):
            raise RevokedTokenError("JWT was issued before the identity cutoff")
        if snapshot.revoked_jti(str(claims.get("jti")), now=self._clock()):
            raise RevokedTokenError("JWT has been revoked")
