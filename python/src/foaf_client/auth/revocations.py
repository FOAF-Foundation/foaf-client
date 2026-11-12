from __future__ import annotations

import json
import logging
import threading
from collections.abc import Callable
from datetime import datetime
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from foaf_client.auth.errors import FetchError
from foaf_client.auth.http import HttpGet

log = logging.getLogger("foaf_client.auth")


def _epoch(value: object) -> float:
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()


class RevocationSnapshot:
    """One audience's revocation state, as served by GET /v1/revocations/snapshot."""

    def __init__(self, payload: dict, *, fetched_at: float) -> None:
        self.audience = str(payload["audience"])
        self.generated_at = _epoch(payload["generated_at"])
        self.fetched_at = fetched_at
        self._revoked_kids = {
            str(row.get("kid")) for row in payload.get("revoked_kids") or [] if row.get("kid")
        }
        self._tokens_invalid_before = {
            str(foaf_id): _epoch(value)
            for foaf_id, value in (payload.get("tokens_invalid_before") or {}).items()
        }
        self._revoked_jtis = {
            str(row["jti"]): _epoch(row["exp"]) for row in payload.get("revoked_jtis") or []
        }

    def revoked_kid(self, kid: str) -> bool:
        return str(kid) in self._revoked_kids

    def cutoff_for(self, foaf_id: str) -> float | None:
        return self._tokens_invalid_before.get(str(foaf_id))

    def revoked_jti(self, jti: str, *, now: float) -> bool:
        expires_at = self._revoked_jtis.get(str(jti))
        return expires_at is not None and expires_at > now


class RevocationCache:
    """Caches the audience's snapshot for `ttl` seconds.

    Same rule as the gem: when a refresh fails, the last snapshot for this
    audience keeps being used (logged as an error once it is older than
    `stale_alert_after`); when there has never been a snapshot, `current()`
    returns None and revocations are not enforced.
    """

    def __init__(
        self,
        *,
        url: str,
        audience: str,
        service_token: str | None,
        http_get: HttpGet,
        ttl: float,
        stale_alert_after: float,
        clock: Callable[[], float],
    ) -> None:
        self._url = url
        self._audience = audience
        self._service_token = service_token or ""
        self._http_get = http_get
        self._ttl = ttl
        self._stale_alert_after = stale_alert_after
        self._clock = clock
        self._snapshot: RevocationSnapshot | None = None
        self._lock = threading.Lock()

    def current(self, request_id: str | None = None) -> RevocationSnapshot | None:
        now = self._clock()
        snap = self._snapshot
        fresh = snap is not None and now - snap.fetched_at < self._ttl
        if fresh and snap.audience == self._audience:
            return snap
        try:
            return self.refresh(request_id=request_id)
        except FetchError as e:
            snap = self._snapshot
            if snap is not None and snap.audience == self._audience:
                if now - snap.generated_at > self._stale_alert_after:
                    log.error("[foaf-client auth] revocation snapshot stale: %s", e)
                return snap
            log.warning("[foaf-client auth] no revocation snapshot available: %s", e)
            return None

    def refresh(self, request_id: str | None = None) -> RevocationSnapshot:
        with self._lock:
            headers = {"Accept": "application/json"}
            if self._service_token:
                headers["Authorization"] = f"Bearer {self._service_token}"
            if request_id:
                headers["X-Request-ID"] = request_id
            try:
                payload = json.loads(self._http_get(self._snapshot_url(), headers))
                snapshot = RevocationSnapshot(payload, fetched_at=self._clock())
            except FetchError:
                raise
            except Exception as e:  # any fetch or parse failure, like the gem
                raise FetchError(str(e)) from e
            if snapshot.audience != self._audience:
                raise FetchError("revocation snapshot audience mismatch")
            self._snapshot = snapshot
            return snapshot

    def _snapshot_url(self) -> str:
        parts = urlsplit(self._url)
        params = [(k, v) for k, v in parse_qsl(parts.query) if k != "audience"]
        params.append(("audience", self._audience))
        return urlunsplit(parts._replace(query=urlencode(params)))
