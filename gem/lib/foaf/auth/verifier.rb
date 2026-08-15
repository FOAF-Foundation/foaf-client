# frozen_string_literal: true

require "json"
require "jwt"
require "net/http"
require "uri"

module Foaf
  module Auth
    class Verifier
      RS256 = "RS256"

      def initialize(jwks_url:, issuer:, audience:, revocations_url:,
                     service_token: nil, jwks_ttl: 300,
                     revocations_ttl: 300, last_good_jwks_age: 86_400,
                     negative_kid_ttl: 30, stale_revocations_after: 900,
                     clock_skew: 30, http_get: nil, clock: nil, logger: nil)
        @issuer = issuer
        @audience = audience
        @clock_skew = clock_skew
        @clock = clock || -> { Time.now.utc }
        fetcher = http_get || method(:net_http_get)
        @jwks = JwksCache.new(
          url: jwks_url,
          http_get: fetcher,
          ttl: jwks_ttl,
          last_good_max_age: last_good_jwks_age,
          negative_ttl: negative_kid_ttl,
          clock: @clock,
          logger: logger
        )
        @revocations = RevocationCache.new(
          url: revocations_url,
          audience: audience,
          service_token: service_token,
          http_get: fetcher,
          ttl: revocations_ttl,
          stale_alert_after: stale_revocations_after,
          clock: @clock,
          logger: logger
        )
      end

      # Verifies the bearer token and returns the decoded claims as a
      # STRING-KEYED hash (JWT.decode(...).first). Read every claim with a
      # string key — `claims["foaf_address"]`, `claims["sub"]`, etc. A symbol
      # key (`claims[:foaf_address]`) always returns nil here. The custodian's
      # one-address-per-identity binding rides along as `claims["foaf_address"]`
      # when the wallet is minted, and is simply absent when it is not (EC 1) —
      # no extra parsing, no DB lookup (AC 2, AC 10).
      def verify(bearer_token, request_id: nil)
        token = bearer_token.to_s.sub(/\ABearer\s+/i, "")
        raise VerificationError, "token is required" if token.empty?

        header = JWT.decode(token, nil, false).last
        unless header["alg"] == RS256
          raise VerificationError, "only RS256 auth tokens are accepted"
        end

        kid = header["kid"].to_s
        snapshot = @revocations.current(request_id: request_id)
        if snapshot&.revoked_kid?(kid)
          raise RevokedTokenError, "JWT signing key has been revoked"
        end

        public_key = @jwks.public_key_for(kid, request_id: request_id)
        claims = JWT.decode(
          token,
          public_key,
          true,
          algorithm: RS256,
          iss: @issuer,
          verify_iss: true,
          aud: @audience,
          verify_aud: true,
          leeway: @clock_skew
        ).first
        enforce_revocations!(claims, snapshot)
        claims
      rescue Error
        raise
      rescue JWT::DecodeError => e
        raise VerificationError, e.message
      end

      def refresh!(request_id: nil)
        @jwks.refresh!(request_id: request_id)
        @revocations.refresh!(request_id: request_id)
        true
      end

      private

      def enforce_revocations!(claims, snapshot)
        return unless snapshot

        cutoff = snapshot.cutoff_for(claims["sub"])
        issued_at = claims["iat"].to_i
        if cutoff && issued_at.positive? && issued_at < cutoff.to_i
          raise RevokedTokenError, "JWT was issued before the identity cutoff"
        end

        if snapshot.revoked_jti?(claims["jti"], now: @clock.call)
          raise RevokedTokenError, "JWT has been revoked"
        end
      end

      def net_http_get(url, headers)
        uri = URI.parse(url)
        request = Net::HTTP::Get.new(uri.request_uri, headers)
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = uri.scheme == "https"
        http.open_timeout = 2
        http.read_timeout = 3
        response = http.request(request)
        unless response.is_a?(Net::HTTPSuccess)
          raise FetchError, "HTTP #{response.code} fetching #{uri.path}"
        end
        response.body
      end
    end
  end
end

