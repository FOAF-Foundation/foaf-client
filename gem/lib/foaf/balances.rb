# frozen_string_literal: true

require "bigdecimal"

module Foaf
  module Balances
    module_function

    # Raw, creditor-oriented /trustlines row -> viewer perspective. The raw
    # balance is creditor-view, so the debtor sees it negated.
    def from_trustline_row(row)
      balance = decimal(fetch(row, "balance"))
      {
        viewer_balance: -balance,
        my_credit_limit: decimal(fetch(row, "received")),
        their_credit_limit: decimal(fetch(row, "given"))
      }
    end

    # Per-viewer userTrustlines row -> viewer perspective. These rows are ALREADY
    # viewer-oriented (the per-user endpoint applied the frame), so there is NO
    # negation: `balance` is already the viewer's balance (negative = the viewer
    # owes), `received` is the viewer's credit limit, `given` is the
    # counterparty's. Mirrors the TS `viewerBalance` for the read-side hooks.
    def from_user_trustline_row(row)
      {
        viewer_balance: decimal(fetch(row, "balance")),
        my_credit_limit: decimal(fetch(row, "received")),
        their_credit_limit: decimal(fetch(row, "given"))
      }
    end

    def fetch(row, key)
      return row[key] if row.respond_to?(:key?) && row.key?(key)
      symbol = key.to_sym
      return row[symbol] if row.respond_to?(:key?) && row.key?(symbol)

      raise KeyError, "missing FOAF trustline field #{key}"
    end
    private_class_method :fetch

    def decimal(value)
      BigDecimal(value.to_s)
    end
    private_class_method :decimal
  end
end

