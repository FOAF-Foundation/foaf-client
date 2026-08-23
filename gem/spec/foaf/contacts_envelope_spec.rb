# frozen_string_literal: true

require "spec_helper"

# Pins that the Ruby side can parse the enriched contacts envelope the TS side
# authors in contracts/contacts-envelope.json. The load-bearing distinction is
# foaf_address: present for a confirmed contact, null for an unconfirmed one.
RSpec.describe "contacts-envelope fixture" do
  let(:fixture) do
    JSON.parse(
      File.read(File.expand_path("../../../contracts/contacts-envelope.json", __dir__))
    )
  end

  it "gives a confirmed contact a non-null foaf_address" do
    confirmed = fixture.fetch("confirmed")

    expect(confirmed).to have_key("foaf_address")
    expect(confirmed.fetch("foaf_address")).not_to be_nil
    expect(confirmed.fetch("display_name")).not_to be_nil
  end

  it "leaves an unconfirmed contact's foaf_address null" do
    unconfirmed = fixture.fetch("unconfirmed")

    expect(unconfirmed).to have_key("foaf_address")
    expect(unconfirmed.fetch("foaf_address")).to be_nil
  end
end
