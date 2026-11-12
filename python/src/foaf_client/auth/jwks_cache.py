from __future__ import annotations

import json
import logging
import threading
from collections.abc import Callable

import jwt

from foaf_client.auth.errors import FetchError, UnknownKidError
from foaf_client.auth.http import HttpGet

log = logging.getLogger("foaf_client.auth")


class JwksCache:
    """Public signing keys from auth's JWKS, by kid.

    Mirrors the gem: keys are reused for `ttl` seconds; on a fetch failure a
    key fetched within `last_good_max_age` is still used; an unknown kid is
    negative-cached for `negative_ttl` seconds so a flood of bad tokens cannot
    hammer the JWKS endpoint.
    """

    def __init__(
        self,
        *,
        url: str,
        http_get: HttpGet,
        ttl: float,
        last_good_max_age: float,
        negative_ttl: float,
        clock: Callable[[], float],
    ) -> None:
        self._url = url
        self._http_get = http_get
        self._ttl = ttl
        self._last_good_max_age = last_good_max_age
        self._negative_ttl = negative_ttl
        self._clock = clock
        self._keys: dict[str, tuple[object, float]] = {}
        self._negative: dict[str, float] = {}
        self._lock = threading.Lock()

    def public_key_for(self, kid: str, request_id: str | None = None) -> object:
        now = self._clock()
        normalized = str(kid or "")
        if not normalized:
            raise UnknownKidError("kid is required")
        until = self._negative.get(normalized)
        if until is not None and until > now:
            raise UnknownKidError(f"kid {normalized!r} is negative-cached")

        entry = self._keys.get(normalized)
        if entry is not None and now - entry[1] < self._ttl:
            return entry[0]

        try:
            self.refresh(request_id=request_id)
        except FetchError:
            entry = self._keys.get(normalized)
            if entry is not None and now - entry[1] <= self._last_good_max_age:
                log.warning("[foaf-client auth] using last-good JWKS for kid=%s", normalized)
                return entry[0]
            raise

        entry = self._keys.get(normalized)
        if entry is not None:
            return entry[0]

        self._negative[normalized] = now + self._negative_ttl
        raise UnknownKidError(f"kid {normalized!r} is unknown")

    def refresh(self, request_id: str | None = None) -> None:
        with self._lock:
            headers = {"Accept": "application/json"}
            if request_id:
                headers["X-Request-ID"] = request_id
            try:
                payload = json.loads(self._http_get(self._url, headers))
                jwks = payload["keys"]
                if not isinstance(jwks, list):
                    raise FetchError("JWKS keys must be an array")
                fetched_at = self._clock()
                keys: dict[str, tuple[object, float]] = {}
                for jwk in jwks:
                    kid = str(jwk.get("kid") or "")
                    if not kid:
                        continue
                    keys[kid] = (jwt.PyJWK(jwk, algorithm="RS256").key, fetched_at)
            except FetchError:
                raise
            except (ValueError, KeyError, TypeError, AttributeError, jwt.PyJWTError) as e:
                raise FetchError(str(e)) from e
            self._keys = keys
            self._negative = {}
