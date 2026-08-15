# frozen_string_literal: true

require "spec_helper"

RSpec.describe Foaf::Custodian::RemoteSignatureProvider do
  # Records the request it receives and replays a queued response, matching the
  # RecordingAdapter shape used in client_spec.rb.
  class CustodianRecordingAdapter
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

  it "posts foaf_id + exact_body to the sign endpoint with a Bearer token and returns the signature" do
    adapter = CustodianRecordingAdapter.new(
      Foaf::HttpResponse.new(status: 200, body: '{"signature":"0xsig"}')
    )
    provider = described_class.new(
      base_url: base_url,
      service_token: service_token,
      foaf_id: foaf_id,
      http_adapter: adapter
    )

    signature = provider.call("0xsigner", '{"value":"5"}')

    request = adapter.requests.first
    expect(signature).to eq("0xsig")
    expect(request.fetch(:method)).to eq(:post)
    expect(request.fetch(:uri).to_s).to eq("#{base_url}/v1/internal/custodian/sign")
    expect(request.dig(:headers, "Authorization")).to eq("Bearer #{service_token}")
    expect(JSON.parse(request.fetch(:body))).to eq(
      "foaf_id" => foaf_id,
      "exact_body" => '{"value":"5"}'
    )
  end

  it "raises SigningError on a 5xx with no local-key fallback (EC 5)" do
    adapter = CustodianRecordingAdapter.new(
      Foaf::HttpResponse.new(status: 503, body: "custodian down")
    )
    provider = described_class.new(
      base_url: base_url,
      service_token: service_token,
      foaf_id: foaf_id,
      http_adapter: adapter
    )

    expect { provider.call("0xsigner", "body") }
      .to raise_error(Foaf::Custodian::SigningError, /HTTP 503/)
  end

  it "raises SigningError on a network failure — never falls back to a local key (EC 5)" do
    failing_adapter = Class.new do
      def request(**)
        raise SocketError, "getaddrinfo failed"
      end
    end.new
    provider = described_class.new(
      base_url: base_url,
      service_token: service_token,
      foaf_id: foaf_id,
      http_adapter: failing_adapter
    )

    expect { provider.call("0xsigner", "body") }
      .to raise_error(Foaf::Custodian::SigningError, /unreachable/)
  end

  it "raises SigningError when the response body has no signature" do
    adapter = CustodianRecordingAdapter.new(
      Foaf::HttpResponse.new(status: 200, body: "{}")
    )
    provider = described_class.new(
      base_url: base_url,
      service_token: service_token,
      foaf_id: foaf_id,
      http_adapter: adapter
    )

    expect { provider.call("0xsigner", "body") }
      .to raise_error(Foaf::Custodian::SigningError, /no signature/)
  end

  describe ".remote_provider factory" do
    it "returns a lambda(address, payload) that plugs into LedgerClient's signature_provider seam" do
      adapter = CustodianRecordingAdapter.new(
        Foaf::HttpResponse.new(status: 200, body: '{"signature":"0xsig"}')
      )
      provider = Foaf::Custodian.remote_provider(
        base_url: base_url,
        service_token: service_token,
        foaf_id: foaf_id,
        http_adapter: adapter
      )

      expect(provider).to respond_to(:call).with(2).arguments
      expect(provider.call("0xsigner", "body")).to eq("0xsig")
    end
  end
end
