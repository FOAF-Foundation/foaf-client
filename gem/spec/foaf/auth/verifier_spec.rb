# frozen_string_literal: true

require "spec_helper"

RSpec.describe Foaf::Auth::Verifier do
  let(:issuer) { "auth.foaf.io" }
  let(:audience) { "test-app" }
  let(:kid) { "test-kid" }
  let(:rsa) { OpenSSL::PKey::RSA.generate(2048) }
  let(:now) { Time.now.utc }
  let(:headers_seen) { [] }
  let(:snapshot_overrides) { {} }
  let(:jwk_keys) { [jwk] }
  let(:http_get) do
    lambda do |url, headers|
      headers_seen << [url, headers]
      if url.include?("jwks")
        JSON.generate(keys: jwk_keys)
      else
        JSON.generate(snapshot_payload.merge(snapshot_overrides))
      end
    end
  end

  def base64url_uint(integer)
    Base64.urlsafe_encode64(integer.to_s(2), padding: false)
  end

  def jwk
    {
      "kty" => "RSA",
      "use" => "sig",
      "alg" => "RS256",
      "kid" => kid,
      "n" => base64url_uint(rsa.public_key.n),
      "e" => base64url_uint(rsa.public_key.e)
    }
  end

  def snapshot_payload
    {
      "generated_at" => now.iso8601,
      "audience" => audience,
      "revoked_jtis" => [],
      "tokens_invalid_before" => {},
      "revoked_kids" => []
    }
  end

  def token(overrides = {}, signing_key: rsa, signing_kid: kid)
    claims = {
      iss: issuer,
      aud: audience,
      sub: "foaf-id-1",
      iat: now.to_i,
      exp: (Time.now.utc + 3600).to_i,
      jti: "jti-1"
    }.merge(overrides)
    JWT.encode(claims, signing_key, "RS256", kid: signing_kid)
  end

  def verifier
    described_class.new(
      jwks_url: "https://auth.test/.well-known/jwks.json",
      issuer: issuer,
      audience: audience,
      revocations_url: "https://auth.test/v1/revocations/snapshot",
      service_token: "service-secret",
      http_get: http_get,
      clock: -> { now }
    )
  end

  it "verifies issuer, audience, signature, and sends the service Bearer" do
    claims = verifier.verify("Bearer #{token}", request_id: "request-1")

    expect(claims["sub"]).to eq("foaf-id-1")
    snapshot_request = headers_seen.find { |url, _| url.include?("revocations") }
    expect(snapshot_request.first).to include("audience=test-app")
    expect(snapshot_request.last["Authorization"]).to eq("Bearer service-secret")
    expect(headers_seen.all? { |_, headers| headers["X-Request-ID"] == "request-1" }).to be(true)
  end

  it "rejects non-RS256 tokens" do
    stale = JWT.encode(
      { sub: "foaf-id-1", exp: (Time.now.utc + 3600).to_i },
      "secret",
      "HS256"
    )

    expect { verifier.verify(stale) }
      .to raise_error(Foaf::Auth::VerificationError, /only RS256/)
  end

  it "rejects revoked signing keys" do
    snapshot_overrides["revoked_kids"] = [{ "kid" => kid, "retired_at" => now.iso8601 }]

    expect { verifier.verify(token) }
      .to raise_error(Foaf::Auth::RevokedTokenError, /signing key/)
  end

  it "rejects identity cutoffs and revoked JTIs" do
    snapshot_overrides["tokens_invalid_before"] = {
      "foaf-id-1" => (now + 10).iso8601
    }
    expect { verifier.verify(token) }
      .to raise_error(Foaf::Auth::RevokedTokenError, /identity cutoff/)

    snapshot_overrides.delete("tokens_invalid_before")
    snapshot_overrides["revoked_jtis"] = [
      { "jti" => "jti-1", "exp" => (now + 3600).iso8601 }
    ]
    expect { verifier.verify(token) }
      .to raise_error(Foaf::Auth::RevokedTokenError, /has been revoked/)
  end

  it "fails closed for an unknown kid" do
    jwk_keys.clear

    expect { verifier.verify(token) }
      .to raise_error(Foaf::Auth::UnknownKidError, /unknown/)
  end

  # One foaf_address per identity — the decoded claims are a STRING-KEYED hash,
  # so consumers read claims["foaf_address"]. These pin AC 2 (Ruby side) and
  # EC 1 (absent, not null, when unbound). AC 10: no ActiveRecord / MySQL is
  # touched — the address rides on the JWT and comes straight out of verify.
  describe "foaf_address claim" do
    let(:address) { "0x1111111111111111111111111111111111111111" }

    it "surfaces foaf_address under the string key when the claim is present" do
      claims = verifier.verify(token({ foaf_address: address }))

      expect(claims["foaf_address"]).to eq(address)
    end

    it "returns nil for both string and symbol keys when the claim is absent (EC 1)" do
      claims = verifier.verify(token)

      expect(claims["foaf_address"]).to be_nil
      expect(claims[:foaf_address]).to be_nil
    end

    # AC 10: starting from a valid JWT carrying foaf_address, the verifier
    # returns the address with no peer-app DB dependency — the only I/O is the
    # stubbed JWKS/revocations HTTP (http_get lambda), never ActiveRecord.
    it "returns foaf_address from a valid JWT with no DB dependency (AC 10)" do
      expect(defined?(ActiveRecord)).to be_nil

      claims = verifier.verify("Bearer #{token({ foaf_address: address })}", request_id: "ac10")

      expect(claims["foaf_address"]).to eq(address)
      expect(claims["foaf_address"].length).to eq(42)
    end
  end
end

