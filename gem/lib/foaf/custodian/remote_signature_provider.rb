# frozen_string_literal: true

require "json"
require "uri"

module Foaf
  module Custodian
    # Pluggable signature_provider that routes signing to the shared
    # FOAF custodian over HTTPS instead of holding a local private key.
    # Drop-in replacement: Foaf::LedgerClient.new(signature_provider: provider).
    #
    # The provider is called by LedgerClient as `call(signer_address, exact_body)`.
    # The signer address is ignored here: the custodian resolves the key from the
    # foaf_id bound at construction (one address per identity, FR 1). The exact
    # body is forwarded verbatim so the custodian signs the same bytes that go on
    # the wire.
    class RemoteSignatureProvider
      SIGN_PATH = "/v1/internal/custodian/sign"

      # base_url:      e.g. "https://auth.foaf.io"
      # service_token: a plaintext token from the service_tokens table
      # foaf_id:       the foaf_id of the user whose key the custodian holds
      # http_adapter:  injectable for tests; defaults to Foaf::NetHttpAdapter
      def initialize(base_url:, service_token:, foaf_id:, http_adapter: nil)
        @base_url = base_url.to_s.sub(%r{/\z}, "")
        @service_token = service_token
        @foaf_id = foaf_id
        @http = http_adapter || NetHttpAdapter.new
      end

      # LedgerClient calls this as signature_provider.call(signer_address, exact_body).
      # Returns the signature string. Raises Foaf::Custodian::SigningError on a
      # non-200 response or a network failure — there is NO local-key fallback (EC 5).
      def call(_signer_address, exact_body)
        uri = URI.parse("#{@base_url}#{SIGN_PATH}")
        body = JSON.generate(foaf_id: @foaf_id, exact_body: exact_body)

        response = perform(uri, body)

        unless success?(response.status)
          raise SigningError,
                "custodian sign failed: HTTP #{response.status} #{truncate(response.body)}"
        end

        signature = parse_signature(response.body)
        if signature.nil? || signature.to_s.empty?
          raise SigningError, "custodian sign returned no signature"
        end

        signature
      end

      private

      def perform(uri, body)
        @http.request(
          method: :post,
          uri: uri,
          headers: {
            "Accept" => "application/json",
            "Content-Type" => "application/json",
            "Authorization" => "Bearer #{@service_token}"
          },
          body: body
        )
      rescue StandardError => e
        raise SigningError, "custodian unreachable: #{e.class}: #{e.message}"
      end

      def parse_signature(body)
        JSON.parse(body.to_s).fetch("signature", nil)
      rescue JSON::ParserError
        raise SigningError, "custodian sign returned an invalid JSON body"
      end

      def success?(status)
        status.to_i >= 200 && status.to_i < 300
      end

      def truncate(body, limit: 200)
        text = body.to_s
        text.length > limit ? "#{text[0, limit]}…" : text
      end
    end

    # Factory lambda for callers who prefer the plain callable form:
    #
    #   Foaf::LedgerClient.new(
    #     signature_provider: Foaf::Custodian.remote_provider(
    #       base_url: "https://auth.foaf.io",
    #       service_token: ENV.fetch("FOAF_AUTH_SERVICE_TOKEN"),
    #       foaf_id: identity.foaf_id
    #     )
    #   )
    def self.remote_provider(base_url:, service_token:, foaf_id:, http_adapter: nil)
      provider = RemoteSignatureProvider.new(
        base_url: base_url,
        service_token: service_token,
        foaf_id: foaf_id,
        http_adapter: http_adapter
      )
      ->(signer_address, exact_body) { provider.call(signer_address, exact_body) }
    end
  end
end
