# frozen_string_literal: true

require "spec_helper"

RSpec.describe Foaf::LedgerSigner do
  it "emits an Ethereum personal-signature recoverable by the FOAF verifier" do
    key = Eth::Key.new
    payload = JSON.generate(
      network_address: "0xnetwork",
      from_address: key.address.to_s,
      to_address: Eth::Key.new.address.to_s,
      value: "4.25"
    )

    signature = described_class.sign!(key.private_hex, payload)
    recovered_public_key = Eth::Signature.personal_recover(payload, signature)
    recovered_address = Eth::Util.public_key_to_address(
      Eth::Util.hex_to_bin(recovered_public_key)
    ).to_s

    expect(recovered_address.downcase).to eq(key.address.to_s.downcase)
    expect(described_class.address(key.private_hex)).to eq(key.address.to_s.downcase)
  end

  it "produces a signature that passes SignatureVerifier.verify_by_address against the wire-contract fixture" do
    fixture = JSON.parse(File.read(File.expand_path("../../../../contracts/wire-contract-fixture.json", __FILE__)))
    sig = described_class.sign!(fixture["private_key_hex"], fixture["payload"])
    recovered_pub = Eth::Signature.personal_recover(fixture["payload"], sig)
    recovered_address = Eth::Util.public_key_to_address(Eth::Util.hex_to_bin(recovered_pub)).to_s
    expect(recovered_address.downcase).to eq(fixture["signer_address"].downcase)
    expect(described_class.address(fixture["private_key_hex"]).downcase).to eq(fixture["signer_address"].downcase)
  end
end
