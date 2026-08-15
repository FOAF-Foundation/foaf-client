# frozen_string_literal: true

module Foaf
  module Custodian
    # Base error for the shared FOAF custodian client surface.
    class Error < StandardError; end

    # Raised when the custodian cannot produce a signature (unreachable,
    # non-200, or a network failure). There is NO local-key fallback (EC 5):
    # a signing failure is surfaced, never silently downgraded.
    class SigningError < Error; end

    # Raised when a counterparty-address lookup fails for a non-404 reason
    # (a 5xx or a network error). A 404 is not an error — it means the
    # identity simply has no address yet, and returns nil (EC 5).
    class ResolutionError < Error; end
  end
end
