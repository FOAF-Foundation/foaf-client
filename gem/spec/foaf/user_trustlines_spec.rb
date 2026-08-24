# frozen_string_literal: true

require "spec_helper"

# Pins the read-side (userTrustlines) projection against the SAME shared,
# live-prod fixture the TS suite asserts (contracts/user-trustlines-rows.json),
# so the Ruby gem and the TS hooks cannot re-drift. Ground truth: robin owes
# alex $166.80. These per-viewer rows are ALREADY viewer-oriented, so the
# converter must NOT negate the balance.
RSpec.describe Foaf::Balances do
  fixture = JSON.parse(
    File.read(File.expand_path("../../../contracts/user-trustlines-rows.json", __dir__))
  )

  describe ".from_user_trustline_row (no negation — row is already viewer-oriented)" do
    it "projects robin's row for alex: -166.8, mine=249.8, theirs=240.0" do
      row = fixture.dig("rows", "robin_for_alex", "wire")
      want = fixture.dig("rows", "robin_for_alex", "expected")

      result = described_class.from_user_trustline_row(row)

      expect(result[:viewer_balance]).to eq(BigDecimal(want.fetch("viewer_balance")))
      expect(result[:my_credit_limit]).to eq(BigDecimal(want.fetch("my_credit_limit")))
      expect(result[:their_credit_limit]).to eq(BigDecimal(want.fetch("their_credit_limit")))
      expect(result[:viewer_balance]).to be_negative # robin owes -> i-owe
    end

    it "projects alex's row for robin (counterparty view): +166.8" do
      row = fixture.dig("rows", "alex_for_robin", "wire")
      want = fixture.dig("rows", "alex_for_robin", "expected")

      result = described_class.from_user_trustline_row(row)

      expect(result[:viewer_balance]).to eq(BigDecimal(want.fetch("viewer_balance")))
      expect(result[:my_credit_limit]).to eq(BigDecimal(want.fetch("my_credit_limit")))
      expect(result[:their_credit_limit]).to eq(BigDecimal(want.fetch("their_credit_limit")))
      expect(result[:viewer_balance]).to be_positive # alex is owed -> owe-me
    end
  end
end
