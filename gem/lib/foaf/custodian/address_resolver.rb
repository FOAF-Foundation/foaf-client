# frozen_string_literal: true

require "json"
require "uri"

module Foaf
  module Custodian
    # Resolves a counterparty's canonical foaf_address from auth's
    # foaf_id → foaf_address binding (B2). The address is always the one auth
    # holds, never a client-supplied value, so a payment can never be routed to
    # an attacker-chosen wallet.
    class AddressResolver
      # base_url:      e.g. "https://auth.foaf.io"
      # service_token: a plaintext token from the service_tokens table
      # http_adapter:  injectable for tests; defaults to Foaf::NetHttpAdapter
      def initialize(base_url:, service_token:, http_adapter: nil)
        @base_url = base_url.to_s.sub(%r{/\z}, "")
        @service_token = service_token
        @http = http_adapter || NetHttpAdapter.new
      end

      # Returns the 0x address string, or nil if the identity has no address yet
      # (404). Never returns nil for a network/5xx error — raises
      # Foaf::Custodian::ResolutionError instead (EC 5).
      def address_for(foaf_id)
        uri = URI.parse(
          "#{@base_url}/v1/internal/identities/#{URI.encode_www_form_component(foaf_id.to_s)}/foaf_address"
        )

        response = perform(uri)
        status = response.status.to_i

        return nil if status == 404
        return parse_address(response.body) if success?(status)

        raise ResolutionError,
              "custodian address lookup failed: HTTP #{status} #{truncate(response.body)}"
      end

      private

      def perform(uri)
        @http.request(
          method: :get,
          uri: uri,
          headers: {
            "Accept" => "application/json",
            "Authorization" => "Bearer #{@service_token}"
          }
        )
      rescue StandardError => e
        raise ResolutionError, "custodian unreachable: #{e.class}: #{e.message}"
      end

      def parse_address(body)
        JSON.parse(body.to_s).fetch("foaf_address", nil)
      rescue JSON::ParserError
        raise ResolutionError, "custodian address lookup returned an invalid JSON body"
      end

      def success?(status)
        status >= 200 && status < 300
      end

      def truncate(body, limit: 200)
        text = body.to_s
        text.length > limit ? "#{text[0, limit]}…" : text
      end
    end
  end
end
