class Error(Exception):
    """Base class for every foaf_client.auth error."""


class VerificationError(Error):
    """The token is not acceptable. Treat as 401."""


class FetchError(Error):
    """JWKS or the revocation snapshot could not be fetched or parsed."""


class UnknownKidError(VerificationError):
    """The token's signing key id is not in the published JWKS."""


class RevokedTokenError(VerificationError):
    """The token, its signing key, or every token of its identity was revoked."""
