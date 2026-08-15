# frozen_string_literal: true

require "spec_helper"

RSpec.describe Foaf::Custodian::AddressResolver do
  class ResolverRecordingAdapter
    attr_reader :requests

    def initialize(*responses)
      @responses = responses
      @requests = []
    end

    def request(**request)
      @requests << request
      @responses.shift || Foaf::HttpResponse.new(status: 200, body: "{}")
    end
  end

  let(:base_url) { "https://auth.foaf.test" }
  let(:service_token) { "svc-token-123" }
  let(:foaf_id) { "identity-42" }

  it "GETs the foaf_address endpoint with a Bearer token and returns the address on 200" do
    adapter = ResolverRecordingAdapter.new(
      Foaf::HttpResponse.new(
        status: 200,
        body: '{"foaf_address":"0x00000000000000000000000000000000000000ab"}'
      )
    )
    resolver = described_class.new(
      base_url: base_url,
      service_token: service_token,
      http_adapter: adapter
    )

    address = resolver.address_for(foaf_id)

    request = adapter.requests.first
    expect(address).to eq("0x00000000000000000000000000000000000000ab")
    expect(request.fetch(:method)).to eq(:get)
    expect(request.fetch(:uri).to_s)
      .to eq("#{base_url}/v1/internal/identities/#{foaf_id}/foaf_address")
    expect(request.dig(:headers, "Authorization")).to eq("Bearer #{service_token}")
  end

  it "returns nil when the identity has no address yet (404)" do
    adapter = ResolverRecordingAdapter.new(
      Foaf::HttpResponse.new(status: 404, body: '{"error":"no foaf_address for this identity"}')
    )
    resolver = described_class.new(
      base_url: base_url,
      service_token: service_token,
      http_adapter: adapter
    )

    expect(resolver.address_for(foaf_id)).to be_nil
  end

  it "raises ResolutionError on a 5xx — never returns nil for a server failure (EC 5)" do
    adapter = ResolverRecordingAdapter.new(
      Foaf::HttpResponse.new(status: 500, body: "boom")
    )
    resolver = described_class.new(
      base_url: base_url,
      service_token: service_token,
      http_adapter: adapter
    )

    expect { resolver.address_for(foaf_id) }
      .to raise_error(Foaf::Custodian::ResolutionError, /HTTP 500/)
  end

  it "raises ResolutionError on a network failure (EC 5)" do
    failing_adapter = Class.new do
      def request(**)
        raise SocketError, "getaddrinfo failed"
      end
    end.new
    resolver = described_class.new(
      base_url: base_url,
      service_token: service_token,
      http_adapter: failing_adapter
    )

    expect { resolver.address_for(foaf_id) }
      .to raise_error(Foaf::Custodian::ResolutionError, /unreachable/)
  end
end
