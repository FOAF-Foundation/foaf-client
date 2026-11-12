"""Default HTTP GET used when the caller does not inject one.

Kept on the standard library so the package's only runtime dependency is PyJWT.
An injected `http_get(url, headers) -> str` replaces it (tests, httpx, retries).
"""

from __future__ import annotations

import urllib.error
import urllib.request
from collections.abc import Callable, Mapping

from foaf_client.auth.errors import FetchError

HttpGet = Callable[[str, Mapping[str, str]], str]


def urllib_get(url: str, headers: Mapping[str, str]) -> str:
    request = urllib.request.Request(url, headers=dict(headers), method="GET")
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            return response.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raise FetchError(f"HTTP {e.code} fetching {urllib.request.urlparse(url).path}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise FetchError(str(e)) from e
